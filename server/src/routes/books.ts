import { randomUUID } from 'node:crypto'

import { json, Router, type ErrorRequestHandler, type Response } from 'express'

import type { BookAgentPromptMessage } from '../agent/bookAgentPrompt.js'
import { OpenAIStreamParseError, parseOpenAIStream } from '../agent/openAIStream.js'
import type { BookStore } from '../books/bookStore.js'
import {
  LEARNING_GOALS,
  LEARNER_LEVELS,
  type BookBlock,
  type LearnerLevel,
  type LearningEvidence,
  type LearningGoal,
  type PretestQuestion,
  type QuizAttempt,
  type StoredBook,
} from '../books/bookTypes.js'
import { buildChapterMessages } from '../books/chapterPrompt.js'
import { ChapterValidationError, normalizeChapterBlocks } from '../books/chapterValidation.js'
import { computeMastery } from '../books/mastery.js'
import { buildPretestMessages } from '../books/pretestPrompt.js'
import { normalizePretestQuestions, PretestValidationError } from '../books/pretestValidation.js'
import { buildDocumentDigest, buildProposalMessages } from '../books/proposalPrompt.js'
import { applyProposalEdits, ProposalEditError, type ProposalEdits } from '../books/proposalEdits.js'
import {
  extractJsonObject,
  normalizeProposal,
  ProposalValidationError,
  type NormalizedProposal,
} from '../books/proposalValidation.js'
import type { DocumentStore, StoredDocument } from '../documents/documentStore.js'

interface BooksEnvironment {
  LLM_API_KEY?: string
  LLM_BASE_URL?: string
  LLM_MODEL?: string
}

export interface BooksLogEvent {
  category:
    | 'upstream_http_error'
    | 'upstream_fetch_error'
    | 'upstream_timeout'
    | 'upstream_stream_error'
    | 'proposal_validation_failed'
    | 'chapter_validation_failed'
    | 'chapter_generated'
    | 'chapter_error'
    | 'book_created'
    | 'book_removed'
    | 'attempt_recorded'
    | 'pretest_generated'
    | 'pretest_validation_failed'
    | 'pretest_result_submitted'
  status?: number
  name?: string
  attempt?: number
  bookId?: string
  chapterId?: string
  documentId?: string
  /** 校验失败的内部原因（固定中文短语，不含原文/密钥） */
  reason?: string
}

export type BooksLogger = (event: BooksLogEvent) => void

interface BooksRouterDependencies {
  documentStore: DocumentStore
  bookStore: BookStore
  fetchImpl?: typeof fetch
  env?: BooksEnvironment
  logger?: BooksLogger
  createBookId?: () => string
  /** 章节生成上游超时（毫秒），默认 CHAPTER_UPSTREAM_TIMEOUT_MS；测试可注入小值 */
  chapterTimeoutMs?: number
  /** generating 任务超过该毫秒数未更新即视为僵死（断连/重启残留），允许重新生成；测试可注入小值 */
  staleJobMs?: number
}

export const UPSTREAM_TIMEOUT_MS = 60_000
// 章节输出预算 6000 tokens，真实上游生成常超过提案用的 60s，章节路径单独放宽到 180s
export const CHAPTER_UPSTREAM_TIMEOUT_MS = 180_000
// generating 任务超过 4 分钟（180s 上游超时 + 余量）未更新即视为僵死
export const STALE_GENERATING_MS = 240_000
const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'TimeoutError', 'OpenAIStreamParseError'])
// 40 是 Agent 问答上下文（bookAgentContract MAX_BLOCKS）的硬顶，不能再高；
// 提案允许 3–6 章，章节生成按 max(4, floor(剩余预算 / 含本章的剩余章数)) 均分预留，
// 保证前面章不挤占末章配额（旧「4 章 × 10 块」摊算下 6 章书末章预算必然 <4，校验必败）
export const BOOK_BLOCK_BUDGET = 40
const CHAPTER_FAILURE_MESSAGE = '章节生成失败，请稍后重试。'

class UpstreamCallError extends Error {
  constructor() {
    super('upstream_call_failed')
    this.name = 'UpstreamCallError'
  }
}

function writeEvent(res: Response, type: string, data: unknown): void {
  if (res.destroyed || res.writableEnded) return
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
}

/** 解析章 sourceAnchor 上的页码范围（'4' 或 '3–6'，en dash / 连字符均可）。 */
function parseAnchorPageRange(value: string | undefined): { start: number; end: number } | null {
  if (typeof value !== 'string') return null
  const match = /^\s*(\d+)\s*(?:[–-]\s*(\d+)\s*)?$/u.exec(value)
  if (!match) return null
  const start = Number(match[1])
  const end = match[2] === undefined ? start : Number(match[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || start > end) {
    return null
  }
  return { start, end }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function emitLog(logger: BooksLogger, event: BooksLogEvent): void {
  try {
    logger(event)
  } catch {
    // Observability must never alter the request or response lifecycle.
  }
}

function safeErrorName(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  return SAFE_ERROR_NAMES.has(error.name) ? error.name : undefined
}

function formatSizeLabel(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.ceil(sizeBytes / 1024))} KB`
}

function buildBook(
  document: StoredDocument,
  proposal: NormalizedProposal,
  goal: LearningGoal,
  learnerLevel: LearnerLevel,
  createBookId: () => string,
): StoredBook {
  const now = new Date().toISOString()
  const chapters = proposal.chapters.map((chapter, index) => {
    const pageText = document.pages.find((page) => page.page === chapter.pageStart)?.text ?? ''
    return {
      id: `ch-${index + 1}`,
      title: chapter.title,
      order: index + 1,
      objective: chapter.objective,
      coreConceptId: `concept-ch-${index + 1}`,
      estimatedMinutes: chapter.estimatedMinutes,
      sourceAnchors: [{
        sourceId: 'S1',
        fileName: document.fileName,
        pageRange: `${chapter.pageStart}–${chapter.pageEnd}`,
        excerpt: pageText.slice(0, 80),
      }],
      status: 'pending' as const,
      blocks: [],
    }
  })

  return {
    id: createBookId(),
    source: {
      id: document.id,
      fileName: document.fileName,
      format: 'PDF',
      pageCount: document.pageCount,
      sizeLabel: formatSizeLabel(document.sizeBytes),
      updatedLabel: document.createdAt.slice(0, 10),
    },
    goal,
    learnerLevel,
    proposal: {
      title: proposal.title || document.fileName.replace(/\.pdf$/iu, ''),
      description: proposal.description,
      rationale: proposal.rationale,
      estimatedMinutes: proposal.estimatedMinutes,
    },
    status: 'proposal',
    chapters,
    activeChapterId: chapters[0]?.id ?? '',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: now,
    updatedAt: now,
    generationJobs: chapters.map((chapter) => ({
      chapterId: chapter.id,
      status: 'pending' as const,
      attempts: 0,
      lastError: null,
      updatedAt: now,
    })),
  }
}

export function createBooksRouter(dependencies: BooksRouterDependencies): Router {
  const router = Router()
  const { documentStore, bookStore } = dependencies
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  const env = dependencies.env ?? process.env
  const createBookId = dependencies.createBookId ?? (() => `book_${randomUUID()}`)
  const chapterTimeoutMs = dependencies.chapterTimeoutMs ?? CHAPTER_UPSTREAM_TIMEOUT_MS
  const staleJobMs = dependencies.staleJobMs ?? STALE_GENERATING_MS
  const logger =
    dependencies.logger ??
    ((event: BooksLogEvent) => {
      console.warn(`[books] ${JSON.stringify(event)}`)
    })

  router.use(json({ limit: '1mb' }))

  async function callUpstream(
    messages: BookAgentPromptMessage[],
    apiKey: string,
  ): Promise<string> {
    const baseUrl = (env.LLM_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/$/u, '')
    const abortController = new AbortController()
    const timeout = setTimeout(() => {
      abortController.abort(new DOMException('Upstream timed out', 'TimeoutError'))
    }, UPSTREAM_TIMEOUT_MS)
    timeout.unref()

    try {
      const upstream = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: env.LLM_MODEL?.trim() || 'deepseek-v4-flash',
          messages,
          stream: true,
          stream_options: { include_usage: true },
          response_format: { type: 'json_object' },
          max_completion_tokens: 1500,
          temperature: 0.2,
        }),
        signal: abortController.signal,
      })

      if (!upstream.ok) {
        emitLog(logger, { category: 'upstream_http_error', status: upstream.status })
        throw new UpstreamCallError()
      }
      if (!upstream.body) throw new UpstreamCallError()

      // 流式收集上游 JSON 文本（复用 book-chat 的 SSE 解析器）
      let text = ''
      await parseOpenAIStream(upstream.body, (frame) => {
        if (frame.type === 'delta') text += frame.text
      })
      return text
    } catch (error) {
      if (error instanceof UpstreamCallError) throw error
      if (abortController.signal.aborted) {
        emitLog(logger, { category: 'upstream_timeout' })
        throw new UpstreamCallError()
      }
      if (error instanceof OpenAIStreamParseError) {
        emitLog(logger, { category: 'upstream_stream_error', name: safeErrorName(error) })
        throw new UpstreamCallError()
      }
      emitLog(logger, { category: 'upstream_fetch_error', name: safeErrorName(error) })
      throw new UpstreamCallError()
    } finally {
      clearTimeout(timeout)
    }
  }

  // 章节生成专用上游调用：超时/断连中止由路由层持有 signal 统一控制，
  // 其余行为（流式收集、json_object、白名单脱敏日志）与目录提案一致
  async function callChapterUpstream(
    messages: BookAgentPromptMessage[],
    apiKey: string,
    signal: AbortSignal,
  ): Promise<string> {
    const baseUrl = (env.LLM_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/$/u, '')
    try {
      const upstream = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: env.LLM_MODEL?.trim() || 'deepseek-v4-flash',
          messages,
          stream: true,
          stream_options: { include_usage: true },
          response_format: { type: 'json_object' },
          max_completion_tokens: 6000,
          temperature: 0.2,
        }),
        signal,
      })

      if (!upstream.ok) {
        emitLog(logger, { category: 'upstream_http_error', status: upstream.status })
        throw new UpstreamCallError()
      }
      if (!upstream.body) throw new UpstreamCallError()

      let text = ''
      await parseOpenAIStream(upstream.body, (frame) => {
        if (frame.type === 'delta') text += frame.text
      })
      return text
    } catch (error) {
      if (error instanceof UpstreamCallError) throw error
      // 中止（超时或客户端断连）由路由层按 timedOut/disconnected 分类，这里不记日志
      if (signal.aborted) throw new UpstreamCallError()
      if (error instanceof OpenAIStreamParseError) {
        emitLog(logger, { category: 'upstream_stream_error', name: safeErrorName(error) })
        throw new UpstreamCallError()
      }
      emitLog(logger, { category: 'upstream_fetch_error', name: safeErrorName(error) })
      throw new UpstreamCallError()
    }
  }

  router.post('/', async (req, res) => {
    const body: unknown = req.body
    const goal = isRecord(body) ? body.goal : undefined
    const learnerLevel = isRecord(body) ? body.learnerLevel : undefined
    const documentId = isRecord(body) ? body.documentId : undefined
    if (
      typeof documentId !== 'string' ||
      !documentId.trim() ||
      !LEARNING_GOALS.includes(goal as LearningGoal) ||
      !LEARNER_LEVELS.includes(learnerLevel as LearnerLevel)
    ) {
      res.status(400).json({ error: 'invalid_request' })
      return
    }

    let document: StoredDocument | null
    try {
      document = await documentStore.get(documentId)
    } catch (error) {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (document === null) {
      res.status(404).json({ error: 'document_not_found' })
      return
    }

    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!apiKey) {
      res.status(503).json({ error: 'proposal_not_configured' })
      return
    }

    const messages = buildProposalMessages({
      digest: buildDocumentDigest(document.pages),
      goal: goal as LearningGoal,
      learnerLevel: learnerLevel as LearnerLevel,
      pageCount: document.pageCount,
    })

    // 失败分类：上游传输/HTTP/流错误直接失败；解析或校验失败带修正指令重试一次
    let proposal: NormalizedProposal | null = null
    let attemptMessages = messages
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let text: string
      try {
        text = await callUpstream(attemptMessages, apiKey)
      } catch {
        res.status(502).json({ error: 'proposal_generation_failed' })
        return
      }
      try {
        proposal = normalizeProposal(extractJsonObject(text), document.pageCount)
        break
      } catch (error) {
        const reason = error instanceof ProposalValidationError ? error.code : 'proposal_invalid'
        emitLog(logger, { category: 'proposal_validation_failed', attempt })
        attemptMessages = [
          ...messages,
          { role: 'assistant', content: text },
          { role: 'user', content: `上次输出未通过校验：${reason}，请只输出合法 JSON。` },
        ]
      }
    }

    if (proposal === null) {
      res.status(502).json({ error: 'proposal_generation_failed' })
      return
    }

    const book = buildBook(document, proposal, goal as LearningGoal, learnerLevel as LearnerLevel, createBookId)
    try {
      await bookStore.save(book)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'book_created', bookId: book.id, documentId: document.id })
    res.status(201).json({ book })
  })

  router.get('/', async (_req, res, next) => {
    try {
      res.status(200).json(await bookStore.list())
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      const book = await bookStore.get(req.params.id)
      if (book === null) {
        res.status(404).json({ error: 'book_not_found' })
        return
      }
      res.status(200).json(book)
    } catch (error) {
      next(error)
    }
  })

  router.delete('/:id', async (req, res, next) => {
    try {
      const removed = await bookStore.remove(req.params.id)
      if (!removed) {
        res.status(404).json({ error: 'book_not_found' })
        return
      }
      emitLog(logger, { category: 'book_removed', bookId: req.params.id })
      res.status(200).json({ deleted: true })
    } catch (error) {
      next(error)
    }
  })

  router.put('/:id/proposal', async (req, res) => {
    let book: StoredBook | null
    try {
      book = await bookStore.get(req.params.id)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (book === null) {
      res.status(404).json({ error: 'book_not_found' })
      return
    }

    let updated: StoredBook
    try {
      updated = applyProposalEdits(book, req.body as ProposalEdits)
    } catch (error) {
      if (error instanceof ProposalEditError) {
        res.status(error.code === 'book_not_editable' ? 409 : 400).json({ error: error.code })
        return
      }
      throw error
    }

    updated = { ...updated, updatedAt: new Date().toISOString() }
    try {
      await bookStore.save(updated)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    res.status(200).json({ book: updated })
  })

  router.post('/:id/confirm', async (req, res) => {
    let book: StoredBook | null
    try {
      book = await bookStore.get(req.params.id)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (book === null) {
      res.status(404).json({ error: 'book_not_found' })
      return
    }
    if (book.status !== 'proposal') {
      res.status(409).json({ error: 'book_not_editable' })
      return
    }

    // 确认目录：进入 generating，激活第一章；章节保持 pending，等客户端逐章触发生成
    const sorted = [...book.chapters].sort((a, b) => a.order - b.order)
    const confirmed: StoredBook = {
      ...book,
      status: 'generating',
      activeChapterId: sorted[0]?.id ?? book.activeChapterId,
      updatedAt: new Date().toISOString(),
    }
    try {
      await bookStore.save(confirmed)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    res.status(200).json({ book: confirmed })
  })

  router.post('/:id/chapters/:cid/generate', async (req, res) => {
    let book: StoredBook | null
    try {
      book = await bookStore.get(req.params.id)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (book === null) {
      res.status(404).json({ error: 'book_not_found' })
      return
    }
    const chapter = book.chapters.find((entry) => entry.id === req.params.cid)
    if (chapter === undefined) {
      res.status(404).json({ error: 'chapter_not_found' })
      return
    }
    // 前置校验失败一律 JSON 409/404/503，不进入 SSE
    // 浏览器断连/进程重启可能留下永不完结的 generating：job 超过阈值未更新视为僵死，
    // 翻为 error 后放行本次重新生成；仍在进行中的 generating 照旧拒绝
    const existingJob = book.generationJobs.find((entry) => entry.chapterId === chapter.id)
    if (
      chapter.status === 'generating' &&
      existingJob !== undefined &&
      Date.now() - Date.parse(existingJob.updatedAt) > staleJobMs
    ) {
      chapter.status = 'error'
      existingJob.status = 'error'
      existingJob.lastError = 'interrupted'
      book.updatedAt = new Date().toISOString()
      existingJob.updatedAt = book.updatedAt
      try {
        await bookStore.save(book)
      } catch {
        res.status(500).json({ error: 'internal_error' })
        return
      }
      emitLog(logger, { category: 'chapter_error', name: 'interrupted', bookId: book.id, chapterId: chapter.id })
    }
    // pending 或 error 状态的章可（重新）生成；generating/ready 拒绝
    if (
      book.status === 'proposal' ||
      (chapter.status !== 'pending' && chapter.status !== 'error')
    ) {
      res.status(409).json({ error: 'chapter_not_generatable' })
      return
    }
    const anchorRange = parseAnchorPageRange(chapter.sourceAnchors[0]?.pageRange)
    let document: StoredDocument | null
    try {
      document = await documentStore.get(book.source.id)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (document === null || anchorRange === null || anchorRange.end > document.pageCount) {
      res.status(409).json({ error: 'chapter_not_generatable' })
      return
    }
    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!apiKey) {
      res.status(503).json({ error: 'chapter_not_configured' })
      return
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const abortController = new AbortController()
    let disconnected = false
    let timedOut = false
    const onClientAbort = () => {
      disconnected = true
      abortController.abort(new DOMException('Client disconnected', 'AbortError'))
    }
    const onResponseClose = () => {
      if (!res.writableFinished) onClientAbort()
    }
    req.once('aborted', onClientAbort)
    res.once('close', onResponseClose)
    const timeout = setTimeout(() => {
      timedOut = true
      abortController.abort(new DOMException('Upstream timed out', 'TimeoutError'))
    }, chapterTimeoutMs)
    timeout.unref()

    const job = book.generationJobs.find((entry) => entry.chapterId === chapter.id)
    const persist = async (): Promise<void> => {
      book.updatedAt = new Date().toISOString()
      if (job !== undefined) job.updatedAt = book.updatedAt
      await bookStore.save(book)
    }
    // 全部章 ready → ready；有 error 章 → partial；其余保持 generating
    const refreshBookStatus = (): void => {
      if (book.chapters.every((entry) => entry.status === 'ready')) {
        book.status = 'ready'
      } else if (book.chapters.some((entry) => entry.status === 'error')) {
        book.status = 'partial'
      } else {
        book.status = 'generating'
      }
    }
    const markChapterError = async (code: string): Promise<void> => {
      chapter.status = 'error'
      if (job !== undefined) {
        job.status = 'error'
        job.lastError = code
      }
      refreshBookStatus()
      await persist()
    }

    try {
      // error 章重试：清空既有 AI 块再重新生成（本阶段服务端无用户内容，无保留义务）
      chapter.blocks = []
      chapter.status = 'generating'
      if (job !== undefined) job.status = 'generating'
      await persist()
      writeEvent(res, 'chapter_start', { chapterId: chapter.id })

      const chapterPages = document.pages.filter(
        (page) => page.page >= anchorRange.start && page.page <= anchorRange.end,
      )
      const proposalDigest = [
        book.proposal.description,
        ...[...book.chapters]
          .sort((a, b) => a.order - b.order)
          .map((entry) => `第${entry.order}章 ${entry.title}：${entry.objective}`),
      ].filter(Boolean).join('\n')
      const baseMessages = buildChapterMessages({
        bookTitle: book.proposal.title,
        proposalDigest,
        chapter: { title: chapter.title, objective: chapter.objective },
        pagesText: buildDocumentDigest(chapterPages),
      })
      const usedBlocks = book.chapters.reduce((sum, entry) => sum + entry.blocks.length, 0)
      // 均分预留：剩余预算平摊给含本章在内的后续章节，且至少留 4 块，
      // 保证 3–6 章书的末章也留得出满足必备块的空间
      const chapterIndex = book.chapters.findIndex((entry) => entry.id === chapter.id)
      const chapterBudget = Math.max(
        4,
        Math.floor((BOOK_BLOCK_BUDGET - usedBlocks) / (book.chapters.length - chapterIndex)),
      )
      const validationCtx = {
        pages: document.pages,
        pageStart: anchorRange.start,
        pageEnd: anchorRange.end,
        fileName: document.fileName,
        remainingBookBudget: chapterBudget,
        // 块 id 以章节 id 为命名空间，保证全书范围唯一（Agent 全书上下文依赖块 id 唯一）
        idPrefix: `${chapter.id}-`,
      }

      // 解析/校验失败带修正指令重试一次；上游传输类失败不重试
      let result: { blocks: BookBlock[]; warnings: string[] } | null = null
      let failureCode = 'chapter_generation_failed'
      let attemptMessages = baseMessages
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        if (job !== undefined) job.attempts += 1
        await persist()
        let text: string
        try {
          text = await callChapterUpstream(attemptMessages, apiKey, abortController.signal)
        } catch {
          failureCode = timedOut ? 'upstream_timeout' : 'upstream_unavailable'
          break
        }
        try {
          result = normalizeChapterBlocks(extractJsonObject(text), validationCtx)
          break
        } catch (error) {
          if (
            !(error instanceof ProposalValidationError) &&
            !(error instanceof ChapterValidationError)
          ) {
            throw error
          }
          emitLog(logger, {
            category: 'chapter_validation_failed',
            attempt,
            bookId: book.id,
            chapterId: chapter.id,
            ...(error instanceof ChapterValidationError && error.reason ? { reason: error.reason } : {}),
          })
          const reason = error instanceof ChapterValidationError ? error.reason : undefined
          attemptMessages = [
            ...baseMessages,
            { role: 'assistant', content: text },
            {
              role: 'user',
              content: reason === undefined
                ? '上次输出未通过校验：chapter_invalid，请只输出合法 JSON。'
                : `上次输出未通过校验：chapter_invalid（${reason}），请修正后只输出合法 JSON。`,
            },
          ]
        }
      }

      if (result === null) {
        await markChapterError(failureCode)
        if (!disconnected && !res.destroyed) {
          writeEvent(res, 'error', { code: failureCode, message: CHAPTER_FAILURE_MESSAGE })
          res.end()
        }
        return
      }

      // 逐块 emit 并逐块落盘，中断时保留已落盘部分
      for (const [index, block] of result.blocks.entries()) {
        chapter.blocks.push(block)
        writeEvent(res, 'block', { index, block })
        await persist()
      }
      chapter.status = 'ready'
      if (job !== undefined) {
        job.status = 'ready'
        job.lastError = null
      }
      refreshBookStatus()
      await persist()
      emitLog(logger, { category: 'chapter_generated', bookId: book.id, chapterId: chapter.id })
      writeEvent(res, 'chapter_done', { blockCount: result.blocks.length, warnings: result.warnings })
      res.end()
    } catch (error) {
      emitLog(logger, {
        category: 'chapter_error',
        name: safeErrorName(error),
        bookId: book.id,
        chapterId: chapter.id,
      })
      try {
        await markChapterError('chapter_generation_failed')
      } catch {
        // store 故障时不覆盖主错误路径
      }
      if (!disconnected && !res.destroyed) {
        writeEvent(res, 'error', {
          code: 'chapter_generation_failed',
          message: CHAPTER_FAILURE_MESSAGE,
        })
        res.end()
      }
    } finally {
      clearTimeout(timeout)
      req.removeListener('aborted', onClientAbort)
      res.removeListener('close', onResponseClose)
    }
  })

  router.post('/:id/attempts', async (req, res) => {
    const body: unknown = req.body
    const blockId = isRecord(body) ? body.blockId : undefined
    const answerId = isRecord(body) ? body.answerId : undefined
    if (
      typeof blockId !== 'string' || !blockId.trim() ||
      typeof answerId !== 'string' || !answerId.trim()
    ) {
      res.status(400).json({ error: 'invalid_request' })
      return
    }

    let book: StoredBook | null
    try {
      book = await bookStore.get(req.params.id)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (book === null) {
      res.status(404).json({ error: 'book_not_found' })
      return
    }

    // 无 LLM 调用：直接读写 bookStore；允许同一块多次作答（复习需要）
    const chapter = book.chapters.find((entry) => entry.blocks.some((block) => block.id === blockId))
    const block = chapter?.blocks.find((entry) => entry.id === blockId)
    if (chapter === undefined || block === undefined || block.type !== 'quiz') {
      res.status(409).json({ error: 'quiz_not_found' })
      return
    }
    if (!block.options.some((option) => option.id === answerId)) {
      res.status(409).json({ error: 'invalid_answer' })
      return
    }

    const now = new Date().toISOString()
    const isCorrect = answerId === block.correctAnswerId
    const attempt: QuizAttempt = {
      id: `attempt_${randomUUID()}`,
      chapterId: chapter.id,
      blockId: block.id,
      answerId,
      isCorrect,
      submittedAt: now,
    }
    const evidence: LearningEvidence = {
      id: `evidence_${randomUUID()}`,
      chapterId: chapter.id,
      conceptId: block.conceptId,
      sourceBlockId: block.id,
      statement: `${isCorrect ? '答对' : '答错待复习'}：${block.question.slice(0, 80)}`,
      outcome: isCorrect ? 'mastered' : 'review',
      createdAt: now,
    }
    book.quizAttempts.push(attempt)
    book.evidence.push(evidence)
    book.updatedAt = now

    // chapter 范围 = 该章全部 quiz 块的 attempts；
    // concept 范围 = 同 conceptId 的 quiz 块的 attempts
    //（conceptId 为空串时只用本块 attempts，避免无关空串块跨块混算）
    const chapterAttempts = book.quizAttempts.filter((entry) => entry.chapterId === chapter.id)
    const conceptBlockIds = new Set(
      block.conceptId === ''
        ? [block.id]
        : book.chapters
            .flatMap((entry) => entry.blocks)
            .filter((entry) => entry.type === 'quiz' && entry.conceptId === block.conceptId)
            .map((entry) => entry.id),
    )
    const mastery = {
      chapter: computeMastery(chapterAttempts),
      concept: computeMastery(book.quizAttempts.filter((entry) => conceptBlockIds.has(entry.blockId))),
    }

    try {
      await bookStore.save(book)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'attempt_recorded', bookId: book.id, chapterId: chapter.id })
    res.status(201).json({ attempt, evidence, mastery })
  })

  router.post('/:id/pretest', async (req, res) => {
    let book: StoredBook | null
    try {
      book = await bookStore.get(req.params.id)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (book === null) {
      res.status(404).json({ error: 'book_not_found' })
      return
    }
    // 目录未确认（proposal）时章节骨架还可能被改，不出摸底题
    if (book.status === 'proposal') {
      res.status(409).json({ error: 'pretest_unavailable' })
      return
    }
    // 幂等：已生成直接返回现存量（含已提交的 result）
    if (book.pretest !== undefined) {
      res.status(200).json(book.pretest)
      return
    }
    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!apiKey) {
      res.status(503).json({ error: 'pretest_not_configured' })
      return
    }

    const chapters = [...book.chapters].sort((a, b) => a.order - b.order)
    const messages = buildPretestMessages({
      bookTitle: book.proposal.title,
      chapters: chapters.map((entry) => ({ id: entry.id, title: entry.title, objective: entry.objective })),
    })

    // 失败分类：上游传输/HTTP/流错误直接失败；解析或校验失败带修正指令重试一次
    let questions: PretestQuestion[] | null = null
    let attemptMessages = messages
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let text: string
      try {
        text = await callUpstream(attemptMessages, apiKey)
      } catch {
        res.status(502).json({ error: 'upstream_unavailable' })
        return
      }
      try {
        questions = normalizePretestQuestions(extractJsonObject(text), chapters.map((entry) => entry.id))
        break
      } catch (error) {
        if (
          !(error instanceof ProposalValidationError) &&
          !(error instanceof PretestValidationError)
        ) {
          throw error
        }
        const reason = error instanceof PretestValidationError ? error.reason : undefined
        emitLog(logger, {
          category: 'pretest_validation_failed',
          attempt,
          bookId: book.id,
          ...(reason ? { reason } : {}),
        })
        attemptMessages = [
          ...messages,
          { role: 'assistant', content: text },
          {
            role: 'user',
            content: reason === undefined
              ? '上次输出未通过校验：pretest_invalid，请只输出合法 JSON。'
              : `上次输出未通过校验：pretest_invalid（${reason}），请修正后只输出合法 JSON。`,
          },
        ]
      }
    }

    if (questions === null) {
      res.status(502).json({ error: 'upstream_unavailable' })
      return
    }

    book.pretest = { questions, result: null }
    book.updatedAt = new Date().toISOString()
    try {
      await bookStore.save(book)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'pretest_generated', bookId: book.id })
    res.status(200).json(book.pretest)
  })

  router.post('/:id/pretest/result', async (req, res) => {
    const body: unknown = req.body
    const answers = isRecord(body) ? body.answers : undefined
    if (
      !isRecord(answers) ||
      !Object.values(answers).every((value) => typeof value === 'string')
    ) {
      res.status(400).json({ error: 'invalid_request' })
      return
    }

    let book: StoredBook | null
    try {
      book = await bookStore.get(req.params.id)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (book === null) {
      res.status(404).json({ error: 'book_not_found' })
      return
    }
    if (book.pretest === undefined) {
      res.status(409).json({ error: 'pretest_unavailable' })
      return
    }

    // 判定：某章关联题全对 → 可跳过；无关联题的章不得进 skippable。
    // 缺答/错答均算不对；suggestedStartChapterId = 第一个非可跳过章（全可跳过则为最后一章）
    const chapters = [...book.chapters].sort((a, b) => a.order - b.order)
    const skippableChapterIds = chapters
      .filter((chapter) => {
        const related = book.pretest!.questions.filter((question) => question.chapterId === chapter.id)
        return related.length > 0 &&
          related.every((question) => answers[question.id] === question.correctAnswerId)
      })
      .map((chapter) => chapter.id)
    const startChapter = chapters.find((chapter) => !skippableChapterIds.includes(chapter.id))
      ?? chapters.at(-1)!

    book.pretest.result = {
      answers: answers as Record<string, string>,
      suggestedStartChapterId: startChapter.id,
      skippableChapterIds,
      submittedAt: new Date().toISOString(),
    }
    book.updatedAt = book.pretest.result.submittedAt
    try {
      await bookStore.save(book)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'pretest_result_submitted', bookId: book.id })
    res.status(200).json({ book })
  })

  const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    const candidate = error as SyntaxError & { status?: unknown; type?: unknown }
    if (
      error instanceof SyntaxError &&
      candidate.status === 400 &&
      candidate.type === 'entity.parse.failed'
    ) {
      res.status(400).json({ error: 'invalid_json' })
      return
    }
    next(error)
  }
  router.use(jsonErrorHandler)

  return router
}
