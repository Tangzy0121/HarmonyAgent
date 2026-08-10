import { randomUUID } from 'node:crypto'

import { json, Router, type ErrorRequestHandler } from 'express'

import type { BookAgentPromptMessage } from '../agent/bookAgentPrompt.js'
import { OpenAIStreamParseError, parseOpenAIStream } from '../agent/openAIStream.js'
import type { BookStore } from '../books/bookStore.js'
import {
  LEARNING_GOALS,
  LEARNER_LEVELS,
  type LearnerLevel,
  type LearningGoal,
  type StoredBook,
} from '../books/bookTypes.js'
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
    | 'book_created'
    | 'book_removed'
  status?: number
  name?: string
  attempt?: number
  bookId?: string
  documentId?: string
}

export type BooksLogger = (event: BooksLogEvent) => void

interface BooksRouterDependencies {
  documentStore: DocumentStore
  bookStore: BookStore
  fetchImpl?: typeof fetch
  env?: BooksEnvironment
  logger?: BooksLogger
  createBookId?: () => string
}

const UPSTREAM_TIMEOUT_MS = 60_000
const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'TimeoutError', 'OpenAIStreamParseError'])

class UpstreamCallError extends Error {
  constructor() {
    super('upstream_call_failed')
    this.name = 'UpstreamCallError'
  }
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
