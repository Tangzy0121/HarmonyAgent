import { randomUUID } from 'node:crypto'

import { json, Router, type ErrorRequestHandler, type Response } from 'express'

import type { BookAgentPromptMessage } from '../agent/bookAgentPrompt.js'
import { OpenAIStreamParseError, parseOpenAIStream } from '../agent/openAIStream.js'
import type { BookStore } from '../books/bookStore.js'
import { AdaptiveQuizValidationError, buildAdaptiveQuizMessages, normalizeAdaptiveQuiz, type NormalizedAdaptiveQuiz } from '../books/adaptiveQuizPrompt.js'
import {
  LEARNING_GOALS,
  LEARNER_LEVELS,
  type AttemptDiagnosis,
  type BookBlock,
  type LearnerLevel,
  type LearningGoal,
  type PretestQuestion,
  type QuizBlock,
  type SourceDocument,
  type StoredBook,
  type UserCard,
  type UserNote,
} from '../books/bookTypes.js'
import { buildChapterMessages } from '../books/chapterPrompt.js'
import { renderBookMarkdown } from '../books/bookMarkdown.js'
import { bookSources, fingerprintOf } from '../books/bookSources.js'
import { ChapterValidationError, normalizeChapterBlocks } from '../books/chapterValidation.js'
import { buildDiagnosisMessages, normalizeDiagnosis } from '../books/diagnosisPrompt.js'
import {
  buildFeynmanMessages,
  FeynmanValidationError,
  normalizeFeynmanResult,
  summarizeChapterBlocks,
  type FeynmanResult,
} from '../books/feynmanPrompt.js'
import { buildPretestMessages } from '../books/pretestPrompt.js'
import { normalizePretestQuestions, PretestValidationError } from '../books/pretestValidation.js'
import { buildDocumentDigest, buildMultiDocumentDigest, buildProposalMessages } from '../books/proposalPrompt.js'
import { applyProposalEdits, ProposalEditError, type ProposalEdits } from '../books/proposalEdits.js'
import { applyProgressEvent, deriveCompletion, type ProgressAction } from '../books/readingProgress.js'
import { deriveEstimate } from '../books/estimate.js'
import { listDueItems, applyReviewGrade } from '../books/schedule.js'
import { buildBankItems } from '../books/bank.js'
import type { RuntimeActor } from '../agent/runtime/agentRuntimeTypes.js'
import {
  LearningEvidenceService,
  LearningEvidenceServiceError,
} from '../learning/learningEvidenceService.js'
import type { NoticeService } from '../notices/noticeService.js'
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
    | 'attempt_diagnosed'
    | 'attempt_diagnosis_failed'
    | 'reading_progress'
    | 'adaptive_quiz_generated'
    | 'adaptive_quiz_validation_failed'
    | 'pretest_generated'
    | 'pretest_validation_failed'
    | 'pretest_result_submitted'
    | 'feynman_judged'
    | 'feynman_validation_failed'
    | 'note_recorded'
    | 'note_removed'
    | 'book_exported'
    | 'card_recorded'
  status?: number
  name?: string
  attempt?: number
  bookId?: string
  chapterId?: string
  documentId?: string
  /** reading_progress 事件携带的进度动作（visit/bookmark/unbookmark） */
  action?: string
  /** 校验失败的内部原因（固定中文短语，不含原文/密钥） */
  reason?: string
}

export type BooksLogger = (event: BooksLogEvent) => void

export interface BooksRouterDependencies {
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
  learningEvidenceService?: LearningEvidenceService
  runtimeActor?: RuntimeActor
  /** 项目通知（PR-D）：章节生成成败挂钩；缺省不记录 */
  notices?: NoticeService
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

function toSourceDocument(document: StoredDocument): SourceDocument {
  return {
    id: document.id,
    fileName: document.fileName,
    format: document.format ?? 'PDF',
    pageCount: document.pageCount,
    sizeLabel: formatSizeLabel(document.sizeBytes),
    updatedLabel: document.createdAt.slice(0, 10),
  }
}

/** 文档全文（sourceFingerprints 的散列输入）：逐页文本以换行拼接 */
function documentFullText(document: StoredDocument): string {
  return document.pages.map((page) => page.text).join('\n')
}

function buildBook(
  documents: StoredDocument[],
  proposal: NormalizedProposal,
  goal: LearningGoal,
  learnerLevel: LearnerLevel,
  createBookId: () => string,
): StoredBook {
  const now = new Date().toISOString()
  const multiSource = documents.length > 1
  const chapters = proposal.chapters.map((chapter, index) => {
    const document = documents[(chapter.sourceDoc ?? 1) - 1] ?? documents[0]
    const pageText = document.pages.find((page) => page.page === chapter.pageStart)?.text ?? ''
    return {
      id: `ch-${index + 1}`,
      title: chapter.title,
      order: index + 1,
      objective: chapter.objective,
      coreConceptId: `concept-ch-${index + 1}`,
      estimatedMinutes: chapter.estimatedMinutes,
      sourceAnchors: [{
        // 多源书锚点指向真实 document id；单源书沿用 'S1'（存量书读取时回退主来源）
        sourceId: multiSource ? document.id : 'S1',
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
    source: toSourceDocument(documents[0]),
    ...(multiSource
      ? {
        sources: documents.map(toSourceDocument),
        sourceFingerprints: Object.fromEntries(
          documents.map((document) => [document.id, fingerprintOf(documentFullText(document))]),
        ),
      }
      : {}),
    goal,
    learnerLevel,
    proposal: {
      title: proposal.title || documents[0].fileName.replace(/\.pdf$/iu, ''),
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
  const runtimeActor = dependencies.runtimeActor ?? {
    userId: 'local-user',
    workspaceId: 'local-workspace',
  }
  const learningEvidenceService = dependencies.learningEvidenceService ??
    new LearningEvidenceService({ bookStore, owner: runtimeActor })
  const logger =
    dependencies.logger ??
    ((event: BooksLogEvent) => {
      console.warn(`[books] ${JSON.stringify(event)}`)
    })
  const notices = dependencies.notices
  /** 通知失败不得影响主路径（与 emitLog 同原则） */
  const safeNotify = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
    } catch {
      // 通知存储故障不覆盖请求主流程
    }
  }
  const notifyChapterFailed = async (
    failedBook: StoredBook,
    failedChapter: StoredBook['chapters'][number],
  ): Promise<void> => {
    if (notices === undefined) return
    await safeNotify(() => notices.append({
      kind: 'chapter_failed',
      severity: 'error',
      message: `《${failedBook.proposal.title}》「${failedChapter.title}」生成失败，可以重试。`,
      target: { bookId: failedBook.id, chapterId: failedChapter.id },
      dedupeKey: `chapter_failed:${failedBook.id}:${failedChapter.id}`,
    }))
  }

  router.use(json({ limit: '1mb' }))

  async function callUpstream(
    messages: BookAgentPromptMessage[],
    apiKey: string,
    maxCompletionTokens = 1500,
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
          max_completion_tokens: maxCompletionTokens,
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
    const documentIdsRaw = isRecord(body) ? body.documentIds : undefined
    if (
      !LEARNING_GOALS.includes(goal as LearningGoal) ||
      !LEARNER_LEVELS.includes(learnerLevel as LearnerLevel)
    ) {
      res.status(400).json({ error: 'invalid_request' })
      return
    }

    // 多文件合书：documentIds（1–5 份）优先；缺省回退旧字段 documentId（单串等价单元素数组）
    let documentIds: string[]
    if (documentIdsRaw !== undefined && documentIdsRaw !== null) {
      if (
        !Array.isArray(documentIdsRaw) ||
        documentIdsRaw.length === 0 ||
        !documentIdsRaw.every((id) => typeof id === 'string' && id.trim() !== '')
      ) {
        res.status(400).json({ error: 'invalid_request' })
        return
      }
      if (documentIdsRaw.length > 5) {
        res.status(409).json({ error: 'too_many_sources' })
        return
      }
      documentIds = documentIdsRaw
    } else if (typeof documentId === 'string' && documentId.trim()) {
      documentIds = [documentId]
    } else {
      res.status(400).json({ error: 'invalid_request' })
      return
    }

    const documents: StoredDocument[] = []
    for (const id of documentIds) {
      let document: StoredDocument | null
      try {
        document = await documentStore.get(id)
      } catch {
        res.status(500).json({ error: 'internal_error' })
        return
      }
      if (document === null) {
        res.status(404).json({ error: 'document_not_found' })
        return
      }
      documents.push(document)
    }

    // 合计字符数上限（单份 45,000 字在上传期已卡；这里卡跨资料合计，保护提案预算）
    const totalCharacters = documents.reduce(
      (sum, document) => sum + document.pages.reduce((pageSum, page) => pageSum + page.text.length, 0),
      0,
    )
    if (totalCharacters > 90_000) {
      res.status(422).json({ error: 'sources_too_long' })
      return
    }

    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!apiKey) {
      res.status(503).json({ error: 'proposal_not_configured' })
      return
    }

    const multiSource = documents.length > 1
    const messages = buildProposalMessages({
      digest: multiSource
        ? buildMultiDocumentDigest(documents.map((document) => ({
          fileName: document.fileName,
          pageCount: document.pageCount,
          pages: document.pages,
        })))
        : buildDocumentDigest(documents[0].pages),
      goal: goal as LearningGoal,
      learnerLevel: learnerLevel as LearnerLevel,
      pageCount: documents[0].pageCount,
      ...(multiSource
        ? { documents: documents.map((document) => ({ fileName: document.fileName, pageCount: document.pageCount })) }
        : {}),
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
        proposal = normalizeProposal(
          extractJsonObject(text),
          multiSource
            ? documents.reduce((sum, document) => sum + document.pageCount, 0)
            : documents[0].pageCount,
          multiSource ? documents.map((document) => document.pageCount) : undefined,
        )
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

    const book = buildBook(documents, proposal, goal as LearningGoal, learnerLevel as LearnerLevel, createBookId)
    try {
      await bookStore.save(book)
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'book_created', bookId: book.id, documentId: documents[0].id })
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
      const committed = await bookStore.update(book.id, (current) => {
        const edited = applyProposalEdits(current, req.body as ProposalEdits)
        Object.assign(current, edited, { updatedAt: new Date().toISOString() })
      })
      updated = committed.book
    } catch (error) {
      if (error instanceof ProposalEditError) {
        res.status(error.code === 'book_not_editable' ? 409 : 400).json({ error: error.code })
        return
      }
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
    let confirmed: StoredBook
    try {
      const committed = await bookStore.update(book.id, (current) => {
        if (current.status !== 'proposal') throw new ProposalEditError('book_not_editable')
        const currentSorted = [...current.chapters].sort((a, b) => a.order - b.order)
        current.status = 'generating'
        current.activeChapterId = currentSorted[0]?.id ?? current.activeChapterId
        current.updatedAt = new Date().toISOString()
      })
      confirmed = committed.book
    } catch (error) {
      if (error instanceof ProposalEditError) {
        res.status(409).json({ error: 'book_not_editable' })
        return
      }
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
        await bookStore.update(book.id, (current) => {
          const currentChapter = current.chapters.find((entry) => entry.id === chapter.id)
          const currentJob = current.generationJobs.find((entry) => entry.chapterId === chapter.id)
          if (currentChapter) currentChapter.status = 'error'
          if (currentJob) {
            currentJob.status = 'error'
            currentJob.lastError = 'interrupted'
            currentJob.updatedAt = book.updatedAt
          }
          current.updatedAt = book.updatedAt
        })
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
      // 多源书：按章首锚点 sourceId 取对应资料；'S1'（存量单源书）或找不到时回退主来源
      const anchorSourceId = chapter.sourceAnchors[0]?.sourceId
      const primaryId = anchorSourceId !== undefined && anchorSourceId !== 'S1' ? anchorSourceId : book.source.id
      document = await documentStore.get(primaryId)
      if (document === null && primaryId !== book.source.id) {
        document = await documentStore.get(book.source.id)
      }
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
      await bookStore.update(book.id, (current) => {
        const currentChapterIndex = current.chapters.findIndex((entry) => entry.id === chapter.id)
        if (currentChapterIndex < 0) throw new Error('chapter_not_found')
        current.chapters[currentChapterIndex] = structuredClone(chapter)
        if (job !== undefined) {
          const currentJobIndex = current.generationJobs.findIndex((entry) => entry.chapterId === chapter.id)
          if (currentJobIndex >= 0) current.generationJobs[currentJobIndex] = structuredClone(job)
        }
        current.updatedAt = book.updatedAt
        if (current.chapters.every((entry) => entry.status === 'ready')) {
          current.status = 'ready'
        } else if (current.chapters.some((entry) => entry.status === 'error')) {
          current.status = 'partial'
        } else {
          current.status = 'generating'
        }
      })
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
        await notifyChapterFailed(book, chapter)
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
      if (notices !== undefined) {
        await safeNotify(() => notices.append({
          kind: 'chapter_ready',
          severity: 'info',
          message: `《${book.proposal.title}》「${chapter.title}」已生成，可以开始阅读。`,
          target: { bookId: book.id, chapterId: chapter.id },
          dedupeKey: `chapter_ready:${book.id}:${chapter.id}`,
        }))
        if (book.status === 'ready') {
          await safeNotify(() => notices.append({
            kind: 'book_ready',
            severity: 'info',
            message: `《${book.proposal.title}》全部章节已生成完毕。`,
            target: { bookId: book.id },
            dedupeKey: `book_ready:${book.id}`,
          }))
        }
      }
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
      await notifyChapterFailed(book, chapter)
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

    // 错题四类诊断：仅答错且配置了 API key 时同步调一次上游；
    // 未配置/上游失败/输出非法一律降级 diagnosis = null，不影响 201 落盘
    let diagnosis: AttemptDiagnosis | null = null
    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!isCorrect && apiKey) {
      try {
        const conceptLabel = book.chapters
          .flatMap((entry) => entry.blocks)
          .flatMap((entry) => (entry.type === 'concept' ? entry.concepts : []))
          .find((concept) => concept.id === block.conceptId)?.label ?? block.conceptId
        const messages = buildDiagnosisMessages({
          question: block.question,
          options: block.options,
          chosenAnswerId: answerId,
          correctAnswerId: block.correctAnswerId,
          conceptLabel,
          chapterTitle: chapter.title,
        })
        const text = await callUpstream(messages, apiKey, 300)
        diagnosis = normalizeDiagnosis(extractJsonObject(text))
        emitLog(logger, { category: 'attempt_diagnosed', bookId: book.id, chapterId: chapter.id })
      } catch {
        diagnosis = null
        emitLog(logger, { category: 'attempt_diagnosis_failed', bookId: book.id, chapterId: chapter.id })
      }
    }

    let recorded: Awaited<ReturnType<LearningEvidenceService['recordQuiz']>>
    try {
      recorded = await learningEvidenceService.recordQuiz(runtimeActor, {
        bookId: book.id,
        blockId: block.id,
        answerId,
        diagnosis,
      })
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'attempt_recorded', bookId: book.id, chapterId: chapter.id })
    res.status(201).json(recorded)
  })

  // 薄弱概念智能出题：LLM 现场生成一道四选一，citation 子串硬校验后落为章末 origin=adaptive 的 quiz 块，
  // 答题/诊断/复习调度全部走既有 POST /:id/attempts 链路
  router.post('/:id/concepts/:cid/quiz', async (req, res) => {
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

    const conceptId = req.params.cid
    const chapter = book.chapters.find((entry) =>
      entry.blocks.some((block) => block.type === 'concept' && block.concepts.some((concept) => concept.id === conceptId)))
    const conceptBlock = chapter?.blocks.find(
      (block) => block.type === 'concept' && block.concepts.some((concept) => concept.id === conceptId),
    )
    const concept = conceptBlock?.type === 'concept'
      ? conceptBlock.concepts.find((entry) => entry.id === conceptId)
      : undefined
    if (chapter === undefined || concept === undefined) {
      res.status(409).json({ error: 'concept_not_found' })
      return
    }

    const adaptiveCount = chapter.blocks.filter(
      (block) => block.type === 'quiz' && block.origin === 'adaptive' && block.conceptId === conceptId,
    ).length
    if (adaptiveCount >= 3) {
      res.status(409).json({ error: 'adaptive_limit_reached' })
      return
    }

    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!apiKey) {
      res.status(503).json({ error: 'adaptive_quiz_not_configured' })
      return
    }

    // 所在章各 ready 块正文拼接，既是出题材料也是 excerpt 子串硬校验的比对基准
    const sourceText = chapter.blocks
      .filter((block) => block.status === 'ready')
      .map((block) => {
        switch (block.type) {
          case 'explanation': return block.body
          case 'example': return `${block.scenario}\n${block.takeaway}`
          case 'formula': return `${block.formula}\n${block.explanation}`
          case 'concept': return block.concepts.map((entry) => `${entry.label}：${entry.description}`).join('\n')
          default: return ''
        }
      })
      .filter((text) => text.length > 0)
      .join('\n')

    // 该概念历史答错记录（question+feedback，最新在前，最多 3 条）
    const quizByBlockId = new Map(
      book.chapters
        .flatMap((entry) => entry.blocks)
        .filter((block) => block.type === 'quiz')
        .map((block) => [block.id, block]),
    )
    const mistakes = [...book.quizAttempts]
      .reverse()
      .filter((attempt) => !attempt.isCorrect)
      .map((attempt) => quizByBlockId.get(attempt.blockId))
      .filter((block): block is QuizBlock => block !== undefined && block.conceptId === conceptId)
      .slice(0, 3)
      .map((block) => ({ question: block.question, feedback: block.feedback }))

    const baseMessages = buildAdaptiveQuizMessages({
      conceptLabel: concept.label,
      conceptDescription: concept.description,
      chapterTitle: chapter.title,
      sourceText,
      mistakes,
    })

    // 失败分类（照抄 pretest 路由）：上游传输类失败直接 502；解析/校验失败带修正指令重试一次
    let quiz: NormalizedAdaptiveQuiz | null = null
    let attemptMessages = baseMessages
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let text: string
      try {
        text = await callUpstream(attemptMessages, apiKey)
      } catch {
        res.status(502).json({ error: 'adaptive_quiz_failed' })
        return
      }
      try {
        quiz = normalizeAdaptiveQuiz(extractJsonObject(text), sourceText)
        break
      } catch (error) {
        if (
          !(error instanceof ProposalValidationError) &&
          !(error instanceof AdaptiveQuizValidationError)
        ) {
          throw error
        }
        const reason = error instanceof AdaptiveQuizValidationError ? error.reason : undefined
        emitLog(logger, {
          category: 'adaptive_quiz_validation_failed',
          attempt,
          bookId: book.id,
          chapterId: chapter.id,
          ...(reason ? { reason } : {}),
        })
        attemptMessages = [
          ...baseMessages,
          { role: 'assistant', content: text },
          {
            role: 'user',
            content: reason === undefined
              ? '上次输出未通过校验：adaptive_quiz_invalid，请只输出合法 JSON。'
              : `上次输出未通过校验：adaptive_quiz_invalid（${reason}），请修正后只输出合法 JSON。`,
          },
        ]
      }
    }

    if (quiz === null) {
      res.status(502).json({ error: 'adaptive_quiz_failed' })
      return
    }

    const block: QuizBlock = {
      id: `blk-adaptive-${randomUUID()}`,
      type: 'quiz',
      status: 'ready',
      title: `加试：${concept.label}`,
      revision: 1,
      sourceAnchors: structuredClone(chapter.sourceAnchors),
      conceptId,
      origin: 'adaptive',
      question: quiz.question,
      options: quiz.options,
      correctAnswerId: quiz.correctAnswerId,
      feedback: quiz.feedback,
    }
    try {
      await bookStore.update(book.id, (current) => {
        const currentChapter = current.chapters.find((entry) => entry.id === chapter.id)
        if (currentChapter === undefined) throw new Error('chapter_not_found')
        currentChapter.blocks.push(block)
        current.updatedAt = new Date().toISOString()
      })
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'adaptive_quiz_generated', bookId: book.id, chapterId: chapter.id })
    res.status(201).json({ block })
  })

  // 用户笔记：用户数据写书级 userNotes，不在生成白名单内，重新生成章节不得覆盖（规格 §6.2）
  router.post('/:id/notes', async (req, res) => {
    const body: unknown = req.body
    const chapterId = isRecord(body) ? body.chapterId : undefined
    const blockId = isRecord(body) ? body.blockId : undefined
    const noteBody = isRecord(body) ? body.body : undefined
    if (
      typeof chapterId !== 'string' || !chapterId.trim() ||
      typeof blockId !== 'string' || !blockId.trim() ||
      typeof noteBody !== 'string' || !noteBody.trim()
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

    const chapter = book.chapters.find((entry) => entry.id === chapterId)
    const block = chapter?.blocks.find((entry) => entry.id === blockId)
    if (chapter === undefined || block === undefined) {
      res.status(409).json({ error: 'block_not_found' })
      return
    }

    const note: UserNote = {
      id: `note_${randomUUID()}`,
      chapterId,
      blockId,
      body: noteBody.trim(),
      createdAt: new Date().toISOString(),
    }
    try {
      await bookStore.update(book.id, (current) => {
        current.userNotes.push(note)
        current.updatedAt = note.createdAt
      })
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'note_recorded', bookId: book.id, chapterId })
    res.status(201).json({ note })
  })

  router.delete('/:id/notes/:noteId', async (req, res) => {
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
    if (!book.userNotes.some((note) => note.id === req.params.noteId)) {
      res.status(404).json({ error: 'note_not_found' })
      return
    }

    try {
      await bookStore.update(book.id, (current) => {
        current.userNotes = current.userNotes.filter((note) => note.id !== req.params.noteId)
        current.updatedAt = new Date().toISOString()
      })
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'note_removed', bookId: book.id })
    res.status(204).end()
  })

  // 阅读进度：幂等三动作（visit/bookmark/unbookmark），返回更新后进度与派生完成度
  router.post('/:id/progress', async (req, res) => {
    const body: unknown = req.body
    const chapterId = isRecord(body) ? body.chapterId : undefined
    const action = isRecord(body) ? body.action : undefined
    const ACTIONS: readonly ProgressAction[] = ['visit', 'bookmark', 'unbookmark']
    if (
      typeof chapterId !== 'string' || !chapterId.trim() ||
      typeof action !== 'string' || !ACTIONS.includes(action as ProgressAction)
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
    if (!book.chapters.some((chapter) => chapter.id === chapterId)) {
      res.status(409).json({ error: 'chapter_not_found' })
      return
    }

    const nowIso = new Date().toISOString()
    try {
      await bookStore.update(book.id, (current) => {
        applyProgressEvent(current, { chapterId, action: action as ProgressAction }, nowIso)
        current.updatedAt = nowIso
      })
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    const updated = await bookStore.get(book.id)
    emitLog(logger, { category: 'reading_progress', bookId: book.id, chapterId, action })
    res.status(200).json({ progress: updated?.readingProgress, completion: deriveCompletion(updated ?? book) })
  })

  // 完成度派生：只读，无写入
  router.get('/:id/completion', async (req, res) => {
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
    res.status(200).json({ completion: deriveCompletion(book) })
  })

  // spine 成本估算：纯算术只读（页均 tokens × 章页数 + 章生成预算），不参与计费
  router.get('/:id/estimate', async (req, res) => {
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
    res.status(200).json({ estimate: deriveEstimate(book) })
  })

  // 导出 Markdown：只读投影，无 LLM、无写入；笔记/引用/证据摘要全部随书导出
  router.get('/:id/export', async (req, res) => {
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

    const markdown = renderBookMarkdown(book)
    const fileName = encodeURIComponent(`${book.proposal.title}.md`)
    emitLog(logger, { category: 'book_exported', bookId: book.id })
    res
      .status(200)
      .setHeader('Content-Type', 'text/markdown; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`)
      .send(markdown)
  })

  // 题库：派生读模型（quiz + flash_cards + 用户问答卡），零 LLM
  router.get('/:id/bank', async (req, res) => {
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
    res.status(200).json({ items: buildBankItems(book) })
  })

  // 用户问答卡（对话沉淀「存入题库」）：用户数据，不在生成白名单内；每书上限 100 张
  router.post('/:id/cards', async (req, res) => {
    const body: unknown = req.body
    const chapterId = isRecord(body) ? body.chapterId : undefined
    const front = isRecord(body) ? body.front : undefined
    const back = isRecord(body) ? body.back : undefined
    const hint = isRecord(body) ? body.hint : undefined
    if (
      typeof chapterId !== 'string' || !chapterId.trim() ||
      typeof front !== 'string' || !front.trim() ||
      typeof back !== 'string' || !back.trim() ||
      (hint !== undefined && typeof hint !== 'string')
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
    if (!book.chapters.some((entry) => entry.id === chapterId)) {
      res.status(409).json({ error: 'chapter_not_found' })
      return
    }
    if ((book.userCards ?? []).length >= 100) {
      res.status(409).json({ error: 'card_limit_reached' })
      return
    }

    const card: UserCard = {
      id: `card_${randomUUID()}`,
      chapterId,
      front: front.trim(),
      back: back.trim(),
      ...(typeof hint === 'string' && hint.trim() ? { hint: hint.trim() } : {}),
      createdAt: new Date().toISOString(),
    }
    try {
      await bookStore.update(book.id, (current) => {
        current.userCards = [...(current.userCards ?? []), card]
        current.updatedAt = card.createdAt
      })
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'card_recorded', bookId: book.id, chapterId })
    res.status(201).json({ card })
  })

  router.get('/:id/review/due', async (req, res) => {
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
    res.status(200).json({ items: listDueItems(book, new Date()) })
  })

  router.post('/:id/review/:blockId/result', async (req, res) => {
    const body: unknown = req.body
    const result = isRecord(body) ? body.result : undefined
    if (result !== 'remembered' && result !== 'forgotten') {
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
    const chapter = book.chapters.find((entry) => entry.blocks.some((block) => block.id === req.params.blockId))
    const block = chapter?.blocks.find((entry) => entry.id === req.params.blockId)
    if (chapter === undefined || block === undefined || block.type !== 'flash_cards') {
      // 用户问答卡：走轻量调度路径（applyReviewGrade 直接更新，不经 evidenceService，规格 §4）
      const card = (book.userCards ?? []).find((entry) => entry.id === req.params.blockId)
      if (card !== undefined) {
        try {
          const { book: updated, result: schedule } = await bookStore.update(book.id, (current) => {
            const scheduleMap = { ...(current.reviewSchedule ?? {}) }
            const next = applyReviewGrade(scheduleMap[card.id], 'flash_cards', result === 'remembered', new Date())
            if (next === null) delete scheduleMap[card.id]
            else scheduleMap[card.id] = next
            current.reviewSchedule = scheduleMap
            current.updatedAt = new Date().toISOString()
            return next
          })
          void updated
          emitLog(logger, { category: 'attempt_recorded', bookId: book.id, chapterId: card.chapterId })
          res.status(200).json({ schedule })
        } catch {
          res.status(500).json({ error: 'internal_error' })
        }
        return
      }
      res.status(409).json({ error: 'review_target_invalid' })
      return
    }
    let recorded: Awaited<ReturnType<LearningEvidenceService['recordReview']>>
    try {
      recorded = await learningEvidenceService.recordReview(runtimeActor, {
        bookId: book.id,
        blockId: block.id,
        result,
      })
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'attempt_recorded', bookId: book.id, chapterId: chapter.id })
    res.status(200).json(recorded)
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

    let persistedPretest: NonNullable<StoredBook['pretest']>
    try {
      const committed = await bookStore.update(book.id, (current) => {
        current.pretest ??= { questions: questions!, result: null }
        current.updatedAt = new Date().toISOString()
        return current.pretest
      })
      persistedPretest = committed.result
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'pretest_generated', bookId: book.id })
    res.status(200).json(persistedPretest)
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

    let committedBook: StoredBook
    try {
      const committed = await bookStore.update(book.id, (current) => {
        if (!current.pretest) throw new Error('pretest_unavailable')
        current.pretest.result = {
          answers: answers as Record<string, string>,
          suggestedStartChapterId: startChapter.id,
          skippableChapterIds,
          submittedAt: new Date().toISOString(),
        }
        current.updatedAt = current.pretest.result.submittedAt
      })
      committedBook = committed.book
    } catch {
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'pretest_result_submitted', bookId: book.id })
    res.status(200).json({ book: committedBook })
  })

  router.post('/:id/chapters/:cid/feynman', async (req, res) => {
    const body: unknown = req.body
    const explanationRaw = isRecord(body) ? body.explanation : undefined
    const explanation = typeof explanationRaw === 'string' ? explanationRaw.trim() : ''
    if (typeof explanationRaw !== 'string' || explanation.length < 1 || explanation.length > 2000) {
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
    const chapter = book.chapters.find((entry) => entry.id === req.params.cid)
    if (chapter === undefined) {
      res.status(404).json({ error: 'chapter_not_found' })
      return
    }
    // 只有 ready 章有完整块可供判分；其余状态复用章节生成的 409 码
    if (chapter.status !== 'ready') {
      res.status(409).json({ error: 'chapter_not_generatable' })
      return
    }
    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!apiKey) {
      res.status(503).json({ error: 'feynman_not_configured' })
      return
    }

    const messages = buildFeynmanMessages({
      chapterTitle: chapter.title,
      objective: chapter.objective,
      blockSummary: summarizeChapterBlocks(chapter),
      explanation,
    })

    // 费曼判定：800 tokens；解析/校验失败带修正指令重试一次，仍失败 502。
    // 成功后仅持久化不可逆复述摘要元数据与分类判定，不保存复述原文或上游原始输出。
    let result: FeynmanResult | null = null
    let attemptMessages = messages
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let text: string
      try {
        text = await callUpstream(attemptMessages, apiKey, 800)
      } catch {
        res.status(502).json({ error: 'upstream_unavailable' })
        return
      }
      try {
        result = normalizeFeynmanResult(extractJsonObject(text))
        break
      } catch (error) {
        if (
          !(error instanceof ProposalValidationError) &&
          !(error instanceof FeynmanValidationError)
        ) {
          throw error
        }
        const reason = error instanceof FeynmanValidationError ? error.reason : undefined
        emitLog(logger, {
          category: 'feynman_validation_failed',
          attempt,
          bookId: book.id,
          chapterId: chapter.id,
          ...(reason ? { reason } : {}),
        })
        attemptMessages = [
          ...messages,
          { role: 'assistant', content: text },
          {
            role: 'user',
            content: reason === undefined
              ? '上次输出未通过校验：feynman_invalid，请只输出合法 JSON。'
              : `上次输出未通过校验：feynman_invalid（${reason}），请修正后只输出合法 JSON。`,
          },
        ]
      }
    }

    if (result === null) {
      res.status(502).json({ error: 'upstream_unavailable' })
      return
    }
    let recorded: Awaited<ReturnType<LearningEvidenceService['recordFeynman']>>
    try {
      recorded = await learningEvidenceService.recordFeynman(runtimeActor, {
        bookId: book.id,
        chapterId: chapter.id,
        confirmedText: explanation,
        result,
      })
    } catch (error) {
      if (error instanceof LearningEvidenceServiceError && error.code === 'chapter_not_found') {
        res.status(404).json({ error: 'chapter_not_found' })
        return
      }
      res.status(500).json({ error: 'internal_error' })
      return
    }
    emitLog(logger, { category: 'feynman_judged', bookId: book.id, chapterId: chapter.id })
    res.status(200).json({
      ...result,
      evidenceId: recorded.evidence.id,
      projectionStatus: recorded.projectionStatus,
      ...(recorded.mastery ? { mastery: recorded.mastery } : {}),
    })
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
