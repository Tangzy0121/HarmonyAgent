import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import type { FlashCardsBlock, QuizBlock } from '../books/bookTypes.js'
import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import type { ParsedDocument } from '../documents/pdfParser.js'
import { LearningEvidenceService } from '../learning/learningEvidenceService.js'
import { createNoticeService, type NoticeService } from '../notices/noticeService.js'
import type { MasteryProjector } from '../learning/masteryProjector.js'
import { BOOK_BLOCK_BUDGET, CHAPTER_UPSTREAM_TIMEOUT_MS, createBooksRouter, UPSTREAM_TIMEOUT_MS } from './books.js'

const API_KEY = 'test-only-secret-key'

const parsed: ParsedDocument = {
  pageCount: 6,
  pages: Array.from({ length: 6 }, (_, i) => ({
    page: i + 1,
    text: `第${i + 1}页正文：机器学习的第${i + 1}部分讲解内容。`,
  })),
}

const proposalJson = {
  title: '机器学习入门',
  description: '根据讲义生成的学习书',
  rationale: '章节按讲义顺序组织',
  estimatedMinutes: 60,
  chapters: [
    { title: '第一章', objective: '目标一', coreConcept: '概念一', estimatedMinutes: 15, pageStart: 1, pageEnd: 2 },
    { title: '第二章', objective: '目标二', coreConcept: '概念二', estimatedMinutes: 15, pageStart: 3, pageEnd: 4 },
    { title: '第三章', objective: '目标三', coreConcept: '概念三', estimatedMinutes: 15, pageStart: 5, pageEnd: 6 },
  ],
}

function upstreamJsonStream(payload: unknown): Response {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const midpoint = Math.floor(text.length / 2)
  const parts = [text.slice(0, midpoint), text.slice(midpoint)]
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

let dir: string
let documentStore: DocumentStore
let bookStore: BookStore
let documentId: string

function appWith(
  fetchImpl: typeof fetch,
  options: { apiKey?: string; logger?: (event: unknown) => void; chapterTimeoutMs?: number; staleJobMs?: number; evidenceService?: LearningEvidenceService; notices?: NoticeService } = {},
) {
  const app = express()
  app.use('/api/books', createBooksRouter({
    documentStore,
    bookStore,
    fetchImpl,
    chapterTimeoutMs: options.chapterTimeoutMs,
    staleJobMs: options.staleJobMs,
    env: {
      LLM_API_KEY: options.apiKey ?? API_KEY,
      LLM_BASE_URL: 'https://api.deepseek.example/',
      LLM_MODEL: '',
    },
    logger: options.logger ?? vi.fn(),
    learningEvidenceService: options.evidenceService,
    notices: options.notices,
  }))
  return app
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'books-route-'))
  documentStore = createDocumentStore(path.join(dir, 'documents'))
  bookStore = createBookStore(path.join(dir, 'books'))
  const meta = await documentStore.save({
    fileName: 'lecture.pdf',
    pdf: Buffer.from('%PDF-fake-bytes'),
    parsed,
  })
  documentId = meta.id
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('POST /api/books', () => {
  it('creates a proposal-status book with chapter shells from a valid upstream reply', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(201)
    const { book } = res.body
    expect(book.id).toMatch(/^book_/u)
    expect(book.status).toBe('proposal')
    expect(book.goal).toBe('理解概念')
    expect(book.learnerLevel).toBe('入门')
    expect(book.source).toMatchObject({
      id: documentId,
      fileName: 'lecture.pdf',
      format: 'PDF',
      pageCount: 6,
    })
    expect(book.proposal).toEqual({
      title: '机器学习入门',
      description: '根据讲义生成的学习书',
      rationale: '章节按讲义顺序组织',
      estimatedMinutes: 60,
    })

    expect(book.chapters).toHaveLength(3)
    expect(book.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2', 'ch-3'])
    for (const [index, chapter] of book.chapters.entries()) {
      expect(chapter.order).toBe(index + 1)
      expect(chapter.status).toBe('pending')
      expect(chapter.blocks).toEqual([])
      expect(chapter.coreConceptId).toBe(`concept-ch-${index + 1}`)
      expect(chapter.sourceAnchors).toHaveLength(1)
      expect(chapter.sourceAnchors[0].sourceId).toBe('S1')
      expect(chapter.sourceAnchors[0].fileName).toBe('lecture.pdf')
    }
    expect(book.chapters[1].sourceAnchors[0].pageRange).toBe('3–4')
    expect(book.chapters[1].sourceAnchors[0].excerpt).toBe(parsed.pages[2].text.slice(0, 80))
    expect(book.activeChapterId).toBe('ch-1')
    expect(book.userNotes).toEqual([])
    expect(book.quizAttempts).toEqual([])
    expect(book.evidence).toEqual([])

    expect(book.generationJobs).toHaveLength(3)
    for (const [index, job] of book.generationJobs.entries()) {
      expect(job).toMatchObject({
        chapterId: `ch-${index + 1}`,
        status: 'pending',
        attempts: 0,
        lastError: null,
      })
      expect(typeof job.updatedAt).toBe('string')
    }

    // 上游请求：流式 json_object 模式，默认模型，消息含摘要与约束
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.deepseek.example/chat/completions')
    expect(options?.method).toBe('POST')
    expect(options?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    })
    const providerBody = JSON.parse(String(options?.body))
    expect(providerBody).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: true,
      response_format: { type: 'json_object' },
      max_completion_tokens: 1500,
    })
    const serializedMessages = JSON.stringify(providerBody.messages)
    expect(serializedMessages).toContain('【第1页】')
    expect(serializedMessages).toContain('理解概念')

    // 落库可回读
    const saved = await bookStore.get(book.id)
    expect(saved).toMatchObject({ id: book.id, status: 'proposal' })
  })

  it('returns 404 document_not_found for an unknown documentId', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentId: 'doc_missing-1', goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'document_not_found' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_request for illegal goal/learnerLevel or missing documentId', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const app = appWith(fetchImpl)

    const badGoal = await request(app)
      .post('/api/books')
      .send({ documentId, goal: '随便看看', learnerLevel: '入门' })
    expect(badGoal.status).toBe(400)
    expect(badGoal.body).toEqual({ error: 'invalid_request' })

    const badLevel = await request(app)
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '专家' })
    expect(badLevel.status).toBe(400)
    expect(badLevel.body).toEqual({ error: 'invalid_request' })

    const missingDoc = await request(app)
      .post('/api/books')
      .send({ goal: '理解概念', learnerLevel: '入门' })
    expect(missingDoc.status).toBe(400)
    expect(missingDoc.body).toEqual({ error: 'invalid_request' })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 503 proposal_not_configured without contacting upstream when the key is absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const res = await request(appWith(fetchImpl, { apiKey: '' }))
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'proposal_not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await bookStore.list()).toEqual([])
  })

  it('maps upstream 401 to 502 proposal_generation_failed without saving a book or leaking the key', async () => {
    const logger = vi.fn()
    const privateBody = JSON.stringify({
      error: { code: 'invalid_api_key', message: `wrong key ${API_KEY}` },
    })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(privateBody, {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }))

    const res = await request(appWith(fetchImpl, { logger }))
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'proposal_generation_failed' })
    expect(res.text).not.toContain(API_KEY)
    expect(await bookStore.list()).toEqual([])
    // 文档保留，可重试
    await expect(documentStore.get(documentId)).resolves.not.toBeNull()

    const serializedLogs = JSON.stringify(logger.mock.calls)
    expect(serializedLogs).not.toContain(API_KEY)
    expect(serializedLogs).not.toContain('wrong key')
  })

  it('retries once with a correction instruction when the first reply is invalid JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(upstreamJsonStream('这不是 JSON'))
      .mockResolvedValueOnce(upstreamJsonStream(proposalJson))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(201)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))
    const lastMessage = retryBody.messages.at(-1)
    expect(lastMessage.role).toBe('user')
    expect(lastMessage.content).toContain('上次输出未通过校验')
    expect(lastMessage.content).toContain('请只输出合法 JSON')

    const saved = await bookStore.get(res.body.book.id)
    expect(saved).not.toBeNull()
  })

  it('also retries once when the first reply fails validation', async () => {
    const invalidProposal = { ...proposalJson, chapters: proposalJson.chapters.slice(0, 2) }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(upstreamJsonStream(invalidProposal))
      .mockResolvedValueOnce(upstreamJsonStream(proposalJson))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(201)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns 502 proposal_generation_failed when both attempts fail validation', async () => {
    const invalidProposal = { ...proposalJson, chapters: proposalJson.chapters.slice(0, 2) }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockImplementation(async () => upstreamJsonStream(invalidProposal))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'proposal_generation_failed' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(await bookStore.list()).toEqual([])
  })
})

describe('GET /api/books', () => {
  it('lists all books', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockImplementation(async () => upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    await request(app).post('/api/books').send({ documentId, goal: '理解概念', learnerLevel: '入门' })
    await request(app).post('/api/books').send({ documentId, goal: '考试复习', learnerLevel: '熟悉' })

    const res = await request(app).get('/api/books')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].status).toBe('proposal')
  })
})

describe('GET /api/books/:id', () => {
  it('returns the full book and 404 book_not_found for unknown ids', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const created = await request(app)
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })
    const id = created.body.book.id as string

    const res = await request(app).get(`/api/books/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(id)
    expect(res.body.chapters).toHaveLength(3)
    expect(res.body.generationJobs).toHaveLength(3)

    const missing = await request(app).get('/api/books/book_missing-1')
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ error: 'book_not_found' })
  })
})

describe('DELETE /api/books/:id', () => {
  it('deletes the book, keeps the source document, and 404s on repeat', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const created = await request(app)
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })
    const id = created.body.book.id as string

    const deleted = await request(app).delete(`/api/books/${id}`)
    expect(deleted.status).toBe(200)
    expect(deleted.body.deleted).toBe(true)

    await expect(bookStore.get(id)).resolves.toBeNull()
    await expect(documentStore.get(documentId)).resolves.not.toBeNull()

    const again = await request(app).delete(`/api/books/${id}`)
    expect(again.status).toBe(404)
    expect(again.body).toEqual({ error: 'book_not_found' })
  })
})

async function createProposalBook(app: express.Express): Promise<{
  id: string
  chapters: { id: string; title: string; order: number; objective: string; estimatedMinutes: number }[]
}> {
  const created = await request(app)
    .post('/api/books')
    .send({ documentId, goal: '理解概念', learnerLevel: '入门' })
  expect(created.status).toBe(201)
  return created.body.book
}

function proposalEditBody(chapters: { id: string }[]): unknown {
  return {
    title: '编辑后的书名',
    description: '编辑后的描述',
    chapters: chapters.map((chapter, index) => ({
      id: chapter.id,
      title: `编辑后的第${index + 1}章`,
      order: index + 1,
      objective: `编辑后的目标${index + 1}`,
      estimatedMinutes: 20,
    })),
  }
}

describe('PUT /api/books/:id/proposal', () => {
  it('saves valid edits, reorders chapters, and bumps updatedAt', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const book = await createProposalBook(app)

    // 确定性比较 updatedAt：先把落库时间戳改成一个过去的固定值
    const stored = (await bookStore.get(book.id))!
    await bookStore.save({ ...stored, updatedAt: '2000-01-01T00:00:00.000Z' })

    const edits = proposalEditBody(book.chapters) as {
      title: string
      description: string
      chapters: { id: string; title: string; order: number; objective: string; estimatedMinutes: number }[]
    }
    // 打乱顺序 + 非规范 order 值，验证重排与归一化
    edits.chapters = [
      { ...edits.chapters[2], order: 10 },
      { ...edits.chapters[0], order: 20 },
      { ...edits.chapters[1], order: 30 },
    ]

    const res = await request(app).put(`/api/books/${book.id}/proposal`).send(edits)

    expect(res.status).toBe(200)
    const updated = res.body.book
    expect(updated.proposal.title).toBe('编辑后的书名')
    expect(updated.proposal.description).toBe('编辑后的描述')
    expect(updated.chapters.map((chapter: { id: string }) => chapter.id))
      .toEqual(['ch-3', 'ch-1', 'ch-2'])
    expect(updated.chapters.map((chapter: { order: number }) => chapter.order)).toEqual([1, 2, 3])
    expect(updated.updatedAt).not.toBe('2000-01-01T00:00:00.000Z')

    const saved = await bookStore.get(book.id)
    expect(saved).toMatchObject({ id: book.id, status: 'proposal' })
    expect(saved?.proposal.title).toBe('编辑后的书名')
  })

  it('returns 400 invalid_proposal_edit for a mismatched chapter id set', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const book = await createProposalBook(app)

    const edits = proposalEditBody(book.chapters) as {
      chapters: { id: string }[]
    }
    edits.chapters[0] = { ...edits.chapters[0], id: 'ch-99' }

    const res = await request(app).put(`/api/books/${book.id}/proposal`).send(edits)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_proposal_edit' })
  })

  it('returns 404 book_not_found for an unknown book id', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)

    const res = await request(app)
      .put('/api/books/book_missing-1/proposal')
      .send(proposalEditBody([{ id: 'ch-1' }, { id: 'ch-2' }, { id: 'ch-3' }]))

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'book_not_found' })
  })

  it('returns 409 book_not_editable after the book is confirmed', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const book = await createProposalBook(app)

    const confirmed = await request(app).post(`/api/books/${book.id}/confirm`)
    expect(confirmed.status).toBe(200)

    const res = await request(app)
      .put(`/api/books/${book.id}/proposal`)
      .send(proposalEditBody(book.chapters))

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'book_not_editable' })
  })
})

describe('POST /api/books/:id/confirm', () => {
  it('confirms a proposal book: status generating, activeChapterId first chapter, chapter shells unchanged', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const book = await createProposalBook(app)

    const res = await request(app).post(`/api/books/${book.id}/confirm`)

    expect(res.status).toBe(200)
    const confirmed = res.body.book
    expect(confirmed.id).toBe(book.id)
    expect(confirmed.status).toBe('generating')
    expect(confirmed.activeChapterId).toBe('ch-1')
    // 章节状态不变：仍为 pending，等客户端逐章触发生成
    for (const chapter of confirmed.chapters) {
      expect(chapter.status).toBe('pending')
      expect(chapter.blocks).toEqual([])
    }
    expect(confirmed.generationJobs).toEqual(book.generationJobs)

    const saved = await bookStore.get(book.id)
    expect(saved).toMatchObject({ id: book.id, status: 'generating', activeChapterId: 'ch-1' })
  })

  it('returns 409 book_not_editable when confirming a non-proposal book', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const book = await createProposalBook(app)

    await request(app).post(`/api/books/${book.id}/confirm`)

    const again = await request(app).post(`/api/books/${book.id}/confirm`)
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ error: 'book_not_editable' })
  })

  it('returns 404 book_not_found for an unknown book id', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)

    const res = await request(app).post('/api/books/book_missing-1/confirm')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'book_not_found' })
  })
})

function sseEventsFrom(responseText: string): Array<{ event: string; data: any }> {
  return responseText
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split('\n')
      return {
        event: lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '',
        data: JSON.parse(lines.find((line) => line.startsWith('data: '))?.slice(6) ?? 'null'),
      }
    })
}

// 章 ch-1 页范围 1–2、ch-2 页范围 3–4、ch-3 页范围 5–6；
// citation 引文必须逐字出自对应页文本（见 parsed 夹具）
// 章级硬要求 ≥4 种块类型：必备三块之外补一个 example 块
function chapterBlocksJson(page: number) {
  return {
    blocks: [
      {
        type: 'explanation',
        title: '本章讲解',
        body: `围绕第${page}页内容展开讲解。`,
        keyPoint: `第${page}页要点`,
      },
      {
        type: 'citation',
        title: '原文引文',
        excerpt: `机器学习的第${page}部分讲解内容`,
        pageRange: String(page),
      },
      {
        type: 'quiz',
        title: '随堂小测',
        conceptId: 'c1',
        question: `第${page}部分讲了什么？`,
        options: [
          { id: 'o1', text: '机器学习' },
          { id: 'o2', text: '烹饪技巧' },
        ],
        correctAnswerId: 'o1',
        feedback: `第${page}页讲解的是机器学习。`,
      },
      {
        type: 'example',
        title: '本章示例',
        scenario: `第${page}页内容的应用示例。`,
        takeaway: `第${page}页示例要点`,
      },
    ],
  }
}

// 摸底题夹具：5 题覆盖 3 章（ch-1 ×2、ch-2 ×2、ch-3 ×1），正确选项均为 'a'
const pretestJson = {
  questions: [
    { chapterId: 'ch-1', question: '第一章的核心概念是什么？', options: [{ id: 'a', text: '机器学习' }, { id: 'b', text: '烹饪技巧' }], correctAnswerId: 'a', explanation: '第一章讲解机器学习基础。' },
    { chapterId: 'ch-1', question: '第一章的方法属于哪一类？', options: [{ id: 'a', text: '监督学习' }, { id: 'b', text: '烘焙' }], correctAnswerId: 'a', explanation: '第一章方法为监督学习。' },
    { chapterId: 'ch-2', question: '第二章的核心概念是什么？', options: [{ id: 'a', text: '模型评估' }, { id: 'b', text: '园艺' }], correctAnswerId: 'a', explanation: '第二章讲解模型评估。' },
    { chapterId: 'ch-2', question: '第二章的指标衡量什么？', options: [{ id: 'a', text: '误差' }, { id: 'b', text: '温度' }], correctAnswerId: 'a', explanation: '指标衡量误差。' },
    { chapterId: 'ch-3', question: '第三章的核心概念是什么？', options: [{ id: 'a', text: '优化' }, { id: 'b', text: '钓鱼' }], correctAnswerId: 'a', explanation: '第三章讲解优化。' },
  ],
}

// 费曼判定夹具：passed 时 gap 为空串
const feynmanJson = {
  passed: true,
  feedback: '讲得不错，抓住了本章的核心概念。',
  gap: '',
}

// 错题诊断夹具：四类之一 + 一句补救建议
const diagnosisJson = {
  type: 'application',
  advice: '看例子块，把概念套到新场景。',
}

function chapterAwareFetch(impl: {
  onChapter?: (body: { messages: unknown }, chapterCalls: number) => unknown
  onPretest?: (body: { messages: unknown }, pretestCalls: number) => unknown
  onFeynman?: (body: { messages: unknown }, feynmanCalls: number) => unknown
  onDiagnosis?: (body: { messages: unknown }, diagnosisCalls: number) => unknown
} = {}) {
  let chapterCalls = 0
  let pretestCalls = 0
  let feynmanCalls = 0
  let diagnosisCalls = 0
  return vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    if (body.max_completion_tokens === 300) {
      diagnosisCalls += 1
      const payload = impl.onDiagnosis?.(body, diagnosisCalls)
      if (payload instanceof Response) return payload
      if (payload !== undefined) return upstreamJsonStream(payload as string)
      return upstreamJsonStream(diagnosisJson)
    }
    if (body.max_completion_tokens === 800) {
      feynmanCalls += 1
      const payload = impl.onFeynman?.(body, feynmanCalls)
      if (payload !== undefined) return upstreamJsonStream(payload as string)
      return upstreamJsonStream(feynmanJson)
    }
    if (body.max_completion_tokens === 6000) {
      chapterCalls += 1
      const payload = impl.onChapter?.(body, chapterCalls)
      if (payload !== undefined) return upstreamJsonStream(payload as string)
      const serialized = JSON.stringify(body.messages)
      // proposalDigest 含全部章节目标，只能按「本章标题」区分章节
      const page = serialized.includes('本章标题：第一章')
        ? 1
        : serialized.includes('本章标题：第二章')
          ? 3
          : 5
      return upstreamJsonStream(chapterBlocksJson(page))
    }
    // 摸底与提案同为 1500 tokens，按消息内容分流：摸底提示词含「摸底」
    const serialized = JSON.stringify(body.messages)
    if (serialized.includes('摸底')) {
      pretestCalls += 1
      const payload = impl.onPretest?.(body, pretestCalls)
      if (payload !== undefined) return upstreamJsonStream(payload as string)
      return upstreamJsonStream(pretestJson)
    }
    return upstreamJsonStream(proposalJson)
  })
}

async function createConfirmedBook(app: express.Express): Promise<{ id: string }> {
  const created = await request(app)
    .post('/api/books')
    .send({ documentId, goal: '理解概念', learnerLevel: '入门' })
  expect(created.status).toBe(201)
  const confirmed = await request(app).post(`/api/books/${created.body.book.id}/confirm`)
  expect(confirmed.status).toBe(200)
  return { id: created.body.book.id as string }
}

describe('POST /api/books/:id/chapters/:cid/generate', () => {
  it('namespaces generated block ids by chapter id so they are unique book-wide', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const first = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const second = await request(app).post(`/api/books/${id}/chapters/ch-2/generate`)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const saved = await bookStore.get(id)
    const ids = saved!.chapters.flatMap((entry) => entry.blocks.map((block) => block.id))
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('blk-ch-1-explanation-1')
    expect(ids).toContain('blk-ch-2-explanation-1')
  })

  it('streams chapter_start → block×N → chapter_done and persists blocks, chapter and job', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    const events = sseEventsFrom(res.text)
    expect(events.map(({ event }) => event)).toEqual([
      'chapter_start',
      'block',
      'block',
      'block',
      'block',
      'chapter_done',
    ])
    expect(events[0].data).toEqual({ chapterId: 'ch-1' })
    expect(events[1].data).toMatchObject({ index: 0 })
    expect(events[1].data.block).toMatchObject({
      id: 'blk-ch-1-explanation-1',
      type: 'explanation',
      status: 'ready',
      revision: 1,
    })
    expect(events[2].data.block).toMatchObject({ id: 'blk-ch-1-citation-1', type: 'citation' })
    expect(events[2].data.block.sourceAnchors).toEqual([{
      sourceId: 'S1',
      fileName: 'lecture.pdf',
      pageRange: '1',
      excerpt: '机器学习的第1部分讲解内容',
    }])
    expect(events[3].data.block).toMatchObject({ id: 'blk-ch-1-quiz-1', type: 'quiz' })
    expect(events[4].data.block).toMatchObject({ id: 'blk-ch-1-example-1', type: 'example' })
    expect(events[5].data).toEqual({ blockCount: 4, warnings: [] })

    // 章节生成上游请求：6000 tokens / 0.2 / json_object / 流式
    const generateCall = fetchImpl.mock.calls.at(-1)!
    const providerBody = JSON.parse(String(generateCall[1]?.body))
    expect(providerBody).toMatchObject({
      stream: true,
      response_format: { type: 'json_object' },
      max_completion_tokens: 6000,
      temperature: 0.2,
    })
    expect(JSON.stringify(providerBody.messages)).toContain('目标一')
    expect(JSON.stringify(providerBody.messages)).toContain('【第1页】')

    // 落盘：章 ready、块齐全、job ready/attempts=1
    const saved = await bookStore.get(id)
    const chapter = saved?.chapters.find((entry) => entry.id === 'ch-1')
    expect(chapter?.status).toBe('ready')
    expect(chapter?.blocks).toHaveLength(4)
    expect(chapter?.blocks.map((block) => block.id)).toEqual([
      'blk-ch-1-explanation-1',
      'blk-ch-1-citation-1',
      'blk-ch-1-quiz-1',
      'blk-ch-1-example-1',
    ])
    const job = saved?.generationJobs.find((entry) => entry.chapterId === 'ch-1')
    expect(job).toMatchObject({ status: 'ready', attempts: 1, lastError: null })
    // 其余章不受影响
    expect(saved?.chapters.find((entry) => entry.id === 'ch-2')?.status).toBe('pending')
    expect(saved?.status).toBe('generating')
  })

  it('returns 409 chapter_not_generatable for a chapter that is not pending', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const first = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(first.status).toBe(200)

    const again = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ error: 'chapter_not_generatable' })
    // 前置 409：未再调上游（提案 1 次 + 章节 1 次）
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns 409 chapter_not_generatable for a chapter in generating status', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const stored = (await bookStore.get(id))!
    stored.chapters[0].status = 'generating'
    await bookStore.save(stored)

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'chapter_not_generatable' })
    expect(fetchImpl).toHaveBeenCalledTimes(1) // 仅提案
  })

  it('regenerates an errored chapter: clears stale blocks, bumps attempts, flips ready', async () => {
    // 前两次章节调用返回非法 JSON（章翻 error），第三次起返回合法块
    const fetchImpl = chapterAwareFetch({
      onChapter: (_body, chapterCalls) =>
        (chapterCalls <= 2 ? '仍然不是 JSON' : chapterBlocksJson(1)),
    })
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const first = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(first.status).toBe(200)
    expect(sseEventsFrom(first.text).at(-1)?.data.code).toBe('chapter_generation_failed')
    const failed = await bookStore.get(id)
    expect(failed?.chapters[0].status).toBe('error')
    expect(failed?.status).toBe('partial')

    // 人为残留一个陈旧 AI 块，验证重试时清空
    const stale = (await bookStore.get(id))!
    stale.chapters[0].blocks.push({
      id: 'blk-explanation-1',
      type: 'explanation',
      status: 'ready',
      title: '陈旧块',
      revision: 1,
      sourceAnchors: [],
      body: '上次失败的残留',
      keyPoint: '残留',
    })
    await bookStore.save(stale)

    const retry = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(retry.status).toBe(200)
    expect(retry.headers['content-type']).toContain('text/event-stream')
    expect(sseEventsFrom(retry.text).map(({ event }) => event)).toEqual([
      'chapter_start',
      'block',
      'block',
      'block',
      'block',
      'chapter_done',
    ])

    const saved = await bookStore.get(id)
    const chapter = saved?.chapters[0]
    expect(chapter?.status).toBe('ready')
    // 陈旧块被清空，只保留本次重新生成的 4 块
    expect(chapter?.blocks).toHaveLength(4)
    expect(chapter?.blocks.every((block) => block.title !== '陈旧块')).toBe(true)
    // attempts 跨轮累计：失败 2 次 + 重试 1 次
    expect(saved?.generationJobs.find((entry) => entry.chapterId === 'ch-1'))
      .toMatchObject({ status: 'ready', attempts: 3, lastError: null })
    // 其余章仍 pending，书状态从 partial 回到 generating
    expect(saved?.status).toBe('generating')
  })

  it('returns 409 chapter_not_generatable when the book is still in proposal status', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const created = await request(app)
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })
    const id = created.body.book.id as string

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'chapter_not_generatable' })
    expect(res.headers['content-type']).not.toContain('text/event-stream')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns 404 for an unknown book or chapter id', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const missingBook = await request(app).post('/api/books/book_missing-1/chapters/ch-1/generate')
    expect(missingBook.status).toBe(404)
    expect(missingBook.body).toEqual({ error: 'book_not_found' })

    const missingChapter = await request(app).post(`/api/books/${id}/chapters/ch-99/generate`)
    expect(missingChapter.status).toBe(404)
    expect(missingChapter.body).toEqual({ error: 'chapter_not_found' })
  })

  it('returns 503 without contacting upstream when the key is absent', async () => {
    const proposalFetch = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const setupApp = appWith(proposalFetch)
    const { id } = await createConfirmedBook(setupApp)

    const noKeyFetch = vi.fn<typeof fetch>()
    const app = appWith(noKeyFetch, { apiKey: '' })
    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'chapter_not_configured' })
    expect(noKeyFetch).not.toHaveBeenCalled()
  })

  it('retries once with a correction instruction when the first reply is invalid JSON', async () => {
    const fetchImpl = chapterAwareFetch({
      onChapter: (_body, chapterCalls) => (chapterCalls === 1 ? '这不是 JSON' : chapterBlocksJson(1)),
    })
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)

    expect(res.status).toBe(200)
    expect(sseEventsFrom(res.text).map(({ event }) => event)).toEqual([
      'chapter_start',
      'block',
      'block',
      'block',
      'block',
      'chapter_done',
    ])
    const retryBody = JSON.parse(String(fetchImpl.mock.calls.at(-1)?.[1]?.body))
    const lastMessage = retryBody.messages.at(-1)
    expect(lastMessage.role).toBe('user')
    expect(lastMessage.content).toContain('上次输出未通过校验')
    const job = (await bookStore.get(id))?.generationJobs.find((entry) => entry.chapterId === 'ch-1')
    expect(job).toMatchObject({ status: 'ready', attempts: 2 })
  })

  it('重试提示携带上次校验失败的具体原因', async () => {
    // 第一次章节调用只给 3 种块类型（缺第 4 种），第二次给合法块
    const threeTypeBlocks = {
      blocks: [
        { type: 'explanation', title: '讲解', body: '正文', keyPoint: '要点' },
        { type: 'citation', title: '引文', excerpt: '机器学习的第1部分讲解内容', pageRange: '1' },
        {
          type: 'quiz',
          title: '小测',
          question: '问？',
          options: [{ id: 'o1', text: '甲' }, { id: 'o2', text: '乙' }],
          correctAnswerId: 'o1',
          feedback: '解',
        },
      ],
    }
    const fetchImpl = chapterAwareFetch({
      onChapter: (_body, chapterCalls) => (chapterCalls === 1 ? threeTypeBlocks : chapterBlocksJson(1)),
    })
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger })
    const { id } = await createConfirmedBook(app)

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(res.status).toBe(200)
    expect(sseEventsFrom(res.text).at(-1)?.event).toBe('chapter_done')

    const retryBody = JSON.parse(String(fetchImpl.mock.calls.at(-1)?.[1]?.body))
    const lastMessage = retryBody.messages.at(-1)
    expect(lastMessage.role).toBe('user')
    expect(lastMessage.content).toBe(
      '上次输出未通过校验：chapter_invalid（需要至少 4 种不同块类型），请修正后只输出合法 JSON。',
    )

    // 审计日志同步携带失败原因，便于定位真实生成中的校验失败
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'chapter_validation_failed',
        attempt: 1,
        reason: '需要至少 4 种不同块类型',
      }),
    )
  })

  it('僵死的 generating 章（job 超时未更新）翻 error 并可重新生成', async () => {
    const fetchImpl = chapterAwareFetch({ onChapter: () => chapterBlocksJson(1) })
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger, staleJobMs: 1_000 })
    const { id } = await createConfirmedBook(app)

    // 直接改写落盘书，模拟断连残留：ch-1 generating 且 job 10 秒未更新
    const stored = await bookStore.get(id)
    const chapter = stored!.chapters[0]
    chapter.status = 'generating'
    const job = stored!.generationJobs.find((entry) => entry.chapterId === chapter.id)!
    job.status = 'generating'
    job.updatedAt = new Date(Date.now() - 10_000).toISOString()
    await bookStore.save(stored!)

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(res.status).toBe(200)
    expect(sseEventsFrom(res.text).at(-1)?.event).toBe('chapter_done')
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'chapter_error', name: 'interrupted', chapterId: 'ch-1' }),
    )

    const after = await bookStore.get(id)
    expect(after!.chapters[0].status).toBe('ready')
    expect(after!.chapters[0].blocks.length).toBeGreaterThan(0)
  })

  it('仍在进行中的 generating 章（job 新鲜）拒绝 409', async () => {
    const fetchImpl = chapterAwareFetch({ onChapter: () => chapterBlocksJson(1) })
    const app = appWith(fetchImpl, { staleJobMs: 60_000 })
    const { id } = await createConfirmedBook(app)

    const stored = await bookStore.get(id)
    const chapter = stored!.chapters[0]
    chapter.status = 'generating'
    const job = stored!.generationJobs.find((entry) => entry.chapterId === chapter.id)!
    job.status = 'generating'
    job.updatedAt = new Date().toISOString()
    await bookStore.save(stored!)

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('chapter_not_generatable')
  })

  it('均分预留：6 章书前 5 章各吃满 9 种块也不挤占末章配额，末章照常生成成功', async () => {
    const chapterNames = ['一', '二', '三', '四', '五', '六']
    const sixChapterProposal = {
      ...proposalJson,
      chapters: chapterNames.map((name, index) => ({
        title: `第${name}章`,
        objective: `目标${index + 1}`,
        coreConcept: `概念${index + 1}`,
        estimatedMinutes: 10,
        pageStart: index + 1,
        pageEnd: index + 1,
      })),
    }
    // 每章上游都返回全部 9 种可生成块（密度上限），考验预算分配
    const nineBlocksJson = (page: number) => ({
      blocks: [
        { type: 'explanation', title: '讲解', body: `第${page}页讲解`, keyPoint: '要点' },
        { type: 'citation', title: '引文', excerpt: `机器学习的第${page}部分讲解内容`, pageRange: String(page) },
        {
          type: 'quiz',
          title: '小测',
          question: '问？',
          options: [{ id: 'o1', text: '甲' }, { id: 'o2', text: '乙' }],
          correctAnswerId: 'o1',
          feedback: '解',
        },
        { type: 'example', title: '示例', scenario: '场景', takeaway: '要点' },
        { type: 'formula', title: '公式', formula: 'y = wx + b', explanation: '线性模型' },
        { type: 'concept', title: '概念', concepts: [{ id: 'c1', label: '机器学习' }], relations: [] },
        { type: 'callout', title: '提示', kind: 'tip', body: '多看原文' },
        {
          type: 'flash_cards',
          title: '闪卡',
          cards: [
            { front: '监督', back: '有标签' },
            { front: '无监督', back: '无标签' },
            { front: '强化', back: '奖励' },
          ],
        },
        { type: 'figure', title: '图解', kind: 'flowchart', mermaid: 'flowchart LR\n  A-->B', caption: '流程' },
      ],
    })
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body))
      if (body.max_completion_tokens !== 6000) return upstreamJsonStream(sixChapterProposal)
      const serialized = JSON.stringify(body.messages)
      const page = chapterNames.findIndex((name) => serialized.includes(`本章标题：第${name}章`)) + 1
      return upstreamJsonStream(nineBlocksJson(page))
    })
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const res = await request(app).post(`/api/books/${id}/chapters/ch-${chapter}/generate`)
      expect(sseEventsFrom(res.text).at(-1)?.event).toBe('chapter_done')
    }
    const last = await request(app).post(`/api/books/${id}/chapters/ch-6/generate`)
    expect(sseEventsFrom(last.text).at(-1)?.event).toBe('chapter_done')

    const saved = await bookStore.get(id)
    expect(saved?.chapters.every((chapter) => chapter.status === 'ready')).toBe(true)
    // 均分预留：第 1 章只分到 floor(40/6)=6 块（而非吃满 9 块），给后续章留配额
    expect(saved?.chapters[0].blocks).toHaveLength(6)
    // 末章仍留得出 ≥4 块的空间，不再必然校验失败
    expect(saved?.chapters[5].blocks.length).toBeGreaterThanOrEqual(4)
  })

  it('emits chapter_generation_failed and marks the chapter error when both attempts are invalid', async () => {
    const fetchImpl = chapterAwareFetch({ onChapter: () => '仍然不是 JSON' })
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)

    expect(res.status).toBe(200)
    const events = sseEventsFrom(res.text)
    expect(events.map(({ event }) => event)).toEqual(['chapter_start', 'error'])
    expect(events[1].data.code).toBe('chapter_generation_failed')
    expect(fetchImpl).toHaveBeenCalledTimes(3) // 提案 1 次 + 章节 2 次

    const saved = await bookStore.get(id)
    expect(saved?.chapters.find((entry) => entry.id === 'ch-1')).toMatchObject({
      status: 'error',
      blocks: [],
    })
    expect(saved?.generationJobs.find((entry) => entry.chapterId === 'ch-1'))
      .toMatchObject({ status: 'error', attempts: 2, lastError: 'chapter_generation_failed' })
    expect(saved?.status).toBe('partial')
  })

  it('retries once and fails when every citation is dropped by validation', async () => {
    const badCitationBlocks = {
      blocks: [
        { type: 'explanation', title: '讲解', body: '正文', keyPoint: '要点' },
        { type: 'citation', title: '伪造引文', excerpt: '原文中不存在的内容', pageRange: '1' },
        {
          type: 'quiz',
          title: '小测',
          conceptId: 'c1',
          question: '问题？',
          options: [{ id: 'o1', text: '甲' }, { id: 'o2', text: '乙' }],
          correctAnswerId: 'o1',
          feedback: '解析',
        },
      ],
    }
    const fetchImpl = chapterAwareFetch({ onChapter: () => badCitationBlocks })
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)

    expect(res.status).toBe(200)
    const events = sseEventsFrom(res.text)
    expect(events.at(-1)?.data.code).toBe('chapter_generation_failed')
    // 校验失败同样重试一次：提案 1 + 章节 2
    expect(fetchImpl).toHaveBeenCalledTimes(3)

    const saved = await bookStore.get(id)
    expect(saved?.chapters.find((entry) => entry.id === 'ch-1')?.status).toBe('error')
    // 其他章状态不变
    expect(saved?.chapters.find((entry) => entry.id === 'ch-2')?.status).toBe('pending')
    expect(saved?.chapters.find((entry) => entry.id === 'ch-3')?.status).toBe('pending')
  })

  it('flips the book to ready once every chapter is ready', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    await request(app).post(`/api/books/${id}/chapters/ch-2/generate`)
    expect((await bookStore.get(id))?.status).toBe('generating')

    await request(app).post(`/api/books/${id}/chapters/ch-3/generate`)
    const readyBook = await bookStore.get(id)
    expect(readyBook?.status).toBe('ready')
    expect(readyBook?.chapters.every((chapter) => chapter.status === 'ready')).toBe(true)
  })

  it('aborts the upstream request and persists the chapter as error when the client disconnects', async () => {
    const proposalFetch = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const setupApp = appWith(proposalFetch)
    const { id } = await createConfirmedBook(setupApp)

    let observeSignal: ((signal: AbortSignal) => void) | undefined
    const signalSeen = new Promise<AbortSignal>((resolve) => { observeSignal = resolve })
    const hangingFetch = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return reject(new Error('missing signal'))
      observeSignal?.(signal)
      // 与真实 fetch 一致：已中止的 signal 立即拒绝
      if (signal.aborted) return reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const app = appWith(hangingFetch)
    const server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    try {
      const responseClosed = new Promise<void>((resolve, reject) => {
        const clientRequest = http.request({
          host: '127.0.0.1',
          port,
          path: `/api/books/${id}/chapters/ch-1/generate`,
          method: 'POST',
        }, (clientResponse) => {
          clientResponse.once('data', () => clientResponse.destroy())
          clientResponse.once('close', resolve)
        })
        clientRequest.once('error', (error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error)
        })
        clientRequest.end()
      })

      const upstreamSignal = await signalSeen
      await responseClosed
      await vi.waitFor(() => expect(upstreamSignal.aborted).toBe(true))
      // 注意：不能用轮询 bookStore.get 等待落盘——Windows 上并发读会持有句柄，
      // 导致 bookStore 原子写的 rename EPERM（读不报错、写失败）。路由本身毫秒内完成，
      // 固定短等待后单次断言即可。
      await new Promise<void>((resolve) => setTimeout(resolve, 300))
      // 章翻 error 落盘，attempts 已计
      const saved = await bookStore.get(id)
      expect(saved?.chapters.find((entry) => entry.id === 'ch-1')?.status).toBe('error')
      expect(saved?.generationJobs.find((entry) => entry.chapterId === 'ch-1'))
        .toMatchObject({ status: 'error', attempts: 1 })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('aborts a slow chapter upstream after the injected chapterTimeoutMs and reports upstream_timeout', async () => {
    const proposalFetch = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(proposalJson))
    const { id } = await createConfirmedBook(appWith(proposalFetch))

    const hangingFetch = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return reject(new Error('missing signal'))
      if (signal.aborted) return reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const app = appWith(hangingFetch, { chapterTimeoutMs: 120 })

    const res = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)

    const events = sseEventsFrom(res.text)
    expect(events.at(-1)?.event).toBe('error')
    expect(events.at(-1)?.data).toMatchObject({ code: 'upstream_timeout' })
    const saved = await bookStore.get(id)
    expect(saved?.chapters.find((entry) => entry.id === 'ch-1')?.status).toBe('error')
  })

  it('章节生成默认超时必须比提案 60s 预算更长（6000 token 章节在真实上游常超过 60s）', () => {
    expect(CHAPTER_UPSTREAM_TIMEOUT_MS).toBeGreaterThan(UPSTREAM_TIMEOUT_MS)
  })

  it('全书块预算等于 Agent 上下文 40 块硬顶，章节侧按均分预留策略分配', () => {
    // bookAgentContract MAX_BLOCKS = 40 是 Agent 问答的上下文硬顶，预算不能再高；
    // 章节生成按 max(4, floor((40 - 已用块数) / 剩余章数)) 均分预留，
    // 保证 3–6 章书的末章也留得出 ≥4 块（替代旧「4 章 × 10 块」摊算）
    expect(BOOK_BLOCK_BUDGET).toBe(40)
  })
})

async function quizBlockOf(bookId: string, chapterId: string): Promise<QuizBlock> {
  const book = await bookStore.get(bookId)
  const block = book?.chapters.find((entry) => entry.id === chapterId)
    ?.blocks.find((entry) => entry.type === 'quiz')
  expect(block).toBeDefined()
  return block as QuizBlock
}

describe('POST /api/books/:id/attempts', () => {
  it('答对：201 返回 attempt/evidence/mastery 并落盘（刷新后可恢复）', async () => {
    const fetchImpl = chapterAwareFetch()
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger })
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')

    const res = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: quiz.correctAnswerId })

    expect(res.status).toBe(201)
    const { attempt, evidence, mastery } = res.body
    expect(attempt.id).toMatch(/^attempt_/u)
    expect(attempt).toMatchObject({
      chapterId: 'ch-1',
      blockId: quiz.id,
      answerId: quiz.correctAnswerId,
      isCorrect: true,
    })
    expect(Number.isNaN(Date.parse(attempt.submittedAt))).toBe(false)
    expect(evidence.id).toMatch(/^evidence_/u)
    expect(evidence).toMatchObject({
      version: '1',
      kind: 'quiz',
      chapterId: 'ch-1',
      conceptId: quiz.conceptId,
      sourceBlockId: quiz.id,
      statement: `答对：${quiz.question}`,
      outcome: 'mastered',
      payload: { attemptId: attempt.id, answerId: quiz.correctAnswerId, isCorrect: true },
    })
    expect(res.body.projectionStatus).toBe('projected')
    // 首次作答封顶 0.5
    expect(mastery).toEqual({ chapter: 0.5, concept: 0.5 })

    // 落盘核实：bookStore 里的 quizAttempts/evidence 包含新记录
    const saved = await bookStore.get(id)
    expect(saved?.quizAttempts).toHaveLength(1)
    expect(saved?.quizAttempts[0]).toMatchObject({ id: attempt.id, isCorrect: true })
    expect(saved?.evidence).toHaveLength(1)
    expect(saved?.evidence[0]).toMatchObject({ id: evidence.id, outcome: 'mastered' })

    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'attempt_recorded', bookId: id, chapterId: 'ch-1' }),
    )
    expect(JSON.stringify(logger.mock.calls)).not.toContain(API_KEY)
  })

  it('允许同一块多次作答：第二次全对返回新 attempt，掌握度封顶 0.8', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')

    const first = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: quiz.correctAnswerId })
    const second = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: quiz.correctAnswerId })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.body.attempt.id).not.toBe(first.body.attempt.id)
    expect(second.body.mastery).toEqual({ chapter: 0.8, concept: 0.8 })

    const saved = await bookStore.get(id)
    expect(saved?.quizAttempts).toHaveLength(2)
    expect(saved?.evidence).toHaveLength(2)
  })

  it('证据已保存但投影失败时仍返回 201 并明确 projection pending', async () => {
    const fetchImpl = chapterAwareFetch()
    const setupApp = appWith(fetchImpl)
    const { id } = await createConfirmedBook(setupApp)
    await request(setupApp).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')
    const failingProjector = {
      project() { throw new Error('private projection details') },
    } as unknown as MasteryProjector
    const evidenceService = new LearningEvidenceService({
      bookStore,
      owner: { userId: 'local-user', workspaceId: 'local-workspace' },
      projector: failingProjector,
    })

    const response = await request(appWith(fetchImpl, { evidenceService }))
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: quiz.correctAnswerId })

    expect(response.status).toBe(201)
    expect(response.body.projectionStatus).toBe('pending')
    expect(response.body.mastery).toBeUndefined()
    expect((await bookStore.get(id))?.evidence).toHaveLength(1)
  })

  it('答错后再答对：掌握度按最近作答重算，答错证据标 review', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')
    const wrongAnswer = quiz.options.find((option) => option.id !== quiz.correctAnswerId)!.id

    const wrong = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: wrongAnswer })
    expect(wrong.status).toBe(201)
    expect(wrong.body.attempt.isCorrect).toBe(false)
    expect(wrong.body.evidence).toMatchObject({
      statement: `答错待复习：${quiz.question}`,
      outcome: 'review',
    })
    expect(wrong.body.mastery).toEqual({ chapter: 0, concept: 0 })

    const right = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: quiz.correctAnswerId })
    expect(right.status).toBe(201)
    // 两次作答：(1*1 + 0*0.95) / (1 + 0.95)，封顶 0.8 不触发
    expect(right.body.mastery.chapter).toBeCloseTo(1 / 1.95, 5)
    expect(right.body.mastery.concept).toBeCloseTo(1 / 1.95, 5)

    const saved = await bookStore.get(id)
    expect(saved?.quizAttempts.map((entry) => entry.isCorrect)).toEqual([false, true])
    expect(saved?.evidence.map((entry) => entry.outcome)).toEqual(['review', 'mastered'])
  })

  it('concept 掌握度跨章汇总同一 conceptId 的 quiz 块，chapter 只算本章', async () => {
    // chapterBlocksJson 各章 quiz 的 conceptId 都是 'c1'
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    await request(app).post(`/api/books/${id}/chapters/ch-2/generate`)
    const quiz1 = await quizBlockOf(id, 'ch-1')
    const quiz2 = await quizBlockOf(id, 'ch-2')

    await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz1.id, answerId: quiz1.correctAnswerId })
    const second = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz2.id, answerId: quiz2.correctAnswerId })

    expect(second.status).toBe(201)
    // ch-2 本章只有 1 次作答 → 封顶 0.5；concept c1 跨章 2 次全对 → 封顶 0.8
    expect(second.body.mastery).toEqual({ chapter: 0.5, concept: 0.8 })
  })

  it('returns 409 quiz_not_found for a missing or non-quiz blockId', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)

    const missing = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: 'blk-ch-1-quiz-99', answerId: 'o1' })
    expect(missing.status).toBe(409)
    expect(missing.body).toEqual({ error: 'quiz_not_found' })

    const nonQuiz = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: 'blk-ch-1-explanation-1', answerId: 'o1' })
    expect(nonQuiz.status).toBe(409)
    expect(nonQuiz.body).toEqual({ error: 'quiz_not_found' })

    expect((await bookStore.get(id))?.quizAttempts).toEqual([])
  })

  it('returns 409 invalid_answer when answerId is not among the quiz options', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')

    const res = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: 'o99' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'invalid_answer' })
    expect((await bookStore.get(id))?.quizAttempts).toEqual([])
  })

  it('returns 404 book_not_found for an unknown book id', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)

    const res = await request(app)
      .post('/api/books/book_missing-1/attempts')
      .send({ blockId: 'blk-ch-1-quiz-1', answerId: 'o1' })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'book_not_found' })
  })

  it('returns 400 invalid_request for missing blockId or answerId', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const res = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: '' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_request' })
    expect(fetchImpl).toHaveBeenCalledTimes(1) // 仅提案
  })

  it('答错后将该 quiz 块写入调度并在响应中返回 schedule', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')
    const wrongAnswer = quiz.options.find((option) => option.id !== quiz.correctAnswerId)!.id

    const response = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: wrongAnswer })

    expect(response.status).toBe(201)
    expect(response.body.schedule).toMatchObject({ kind: 'quiz', stage: 0, lapses: 1 })
    // 持久化生效
    const stored = await bookStore.get(id)
    expect(stored?.reviewSchedule?.[quiz.id]?.stage).toBe(0)
  })

  it('答对调度中的块会推进档位；首次答对（从未答错）schedule 为 null', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    await request(app).post(`/api/books/${id}/chapters/ch-2/generate`)
    const quiz1 = await quizBlockOf(id, 'ch-1')
    const quiz2 = await quizBlockOf(id, 'ch-2')
    const wrongAnswer = quiz1.options.find((option) => option.id !== quiz1.correctAnswerId)!.id

    // 先答错一次 → 再答对：schedule.stage === 1，dueAt 在未来
    await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz1.id, answerId: wrongAnswer })
    const graded = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz1.id, answerId: quiz1.correctAnswerId })
    expect(graded.status).toBe(201)
    expect(graded.body.schedule).toMatchObject({ kind: 'quiz', stage: 1, lapses: 1 })
    expect(Date.parse(graded.body.schedule.dueAt)).toBeGreaterThan(Date.now())

    // 另取一个从未答错的 quiz 块直接答对：schedule 为 null，且不入调度
    const fresh = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz2.id, answerId: quiz2.correctAnswerId })
    expect(fresh.status).toBe(201)
    expect(fresh.body.schedule).toBeNull()

    const stored = await bookStore.get(id)
    expect(stored?.reviewSchedule?.[quiz1.id]?.stage).toBe(1)
    expect(stored?.reviewSchedule?.[quiz2.id]).toBeUndefined()
  })

  it('答错时同步诊断并随 201 返回；诊断持久化到 attempt', async () => {
    const fetchImpl = chapterAwareFetch()
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger })
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')
    const wrongAnswer = quiz.options.find((option) => option.id !== quiz.correctAnswerId)!.id

    const response = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: wrongAnswer })

    expect(response.status).toBe(201)
    expect(response.body.diagnosis).toEqual(diagnosisJson)
    expect(response.body.attempt.diagnosis).toEqual(diagnosisJson)

    const saved = await bookStore.get(id)
    expect(saved?.quizAttempts[0]?.diagnosis).toEqual(diagnosisJson)

    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'attempt_diagnosed', bookId: id, chapterId: 'ch-1' }),
    )
    expect(JSON.stringify(logger.mock.calls)).not.toContain(API_KEY)
    expect(JSON.stringify(logger.mock.calls)).not.toContain(quiz.question)
  })

  it('上游失败时 diagnosis 为 null 且答题仍成功', async () => {
    const fetchImpl = chapterAwareFetch({
      onDiagnosis: () => new Response('upstream boom', { status: 500 }),
    })
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger })
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')
    const wrongAnswer = quiz.options.find((option) => option.id !== quiz.correctAnswerId)!.id

    const response = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: wrongAnswer })

    expect(response.status).toBe(201)
    expect(response.body.diagnosis).toBeNull()
    expect(response.body.attempt.isCorrect).toBe(false)

    const saved = await bookStore.get(id)
    expect(saved?.quizAttempts[0]?.diagnosis ?? null).toBeNull()

    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'attempt_diagnosis_failed', bookId: id, chapterId: 'ch-1' }),
    )
  })

  it('诊断输出非法 JSON 时降级为 null 且答题仍成功', async () => {
    const fetchImpl = chapterAwareFetch({ onDiagnosis: () => '这不是 JSON' })
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')
    const wrongAnswer = quiz.options.find((option) => option.id !== quiz.correctAnswerId)!.id

    const response = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: wrongAnswer })

    expect(response.status).toBe(201)
    expect(response.body.diagnosis).toBeNull()
  })

  it('未配置 LLM_API_KEY 时 diagnosis 为 null 且未发起诊断请求', async () => {
    const setupApp = appWith(chapterAwareFetch())
    const { id } = await createConfirmedBook(setupApp)
    await request(setupApp).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')
    const wrongAnswer = quiz.options.find((option) => option.id !== quiz.correctAnswerId)!.id

    const noKeyFetch = vi.fn<typeof fetch>()
    const app = appWith(noKeyFetch, { apiKey: '' })
    const response = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: wrongAnswer })

    expect(response.status).toBe(201)
    expect(response.body.diagnosis).toBeNull()
    expect(noKeyFetch).not.toHaveBeenCalled()
  })

  it('答对时 diagnosis 为 null 且不调用上游', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(id, 'ch-1')
    const callsBefore = fetchImpl.mock.calls.length

    const response = await request(app)
      .post(`/api/books/${id}/attempts`)
      .send({ blockId: quiz.id, answerId: quiz.correctAnswerId })

    expect(response.status).toBe(201)
    expect(response.body.diagnosis).toBeNull()
    expect(fetchImpl.mock.calls.length).toBe(callsBefore)
  })
})

async function flashBlockOf(bookId: string, chapterId: string): Promise<FlashCardsBlock> {
  const book = await bookStore.get(bookId)
  const block = book?.chapters.find((entry) => entry.id === chapterId)
    ?.blocks.find((entry) => entry.type === 'flash_cards')
  expect(block).toBeDefined()
  return block as FlashCardsBlock
}

// 在默认章节块后追加 flash_cards 块，供闪卡自评测试使用
const flashChapterBlocks = {
  blocks: [
    ...chapterBlocksJson(1).blocks,
    { type: 'flash_cards', title: '本章闪卡', cards: [
      { front: '监督学习', back: '有标签数据' },
      { front: '无监督学习', back: '无标签数据' },
      { front: '强化学习', back: '奖励信号' },
    ] },
  ],
}
const flashChapterFetch = () => chapterAwareFetch({ onChapter: () => flashChapterBlocks })

describe('GET /api/books/:id/review/due', () => {
  it('GET review/due 返回到期项并按 dueAt 升序', async () => {
    // 造书后先答错 quiz（入调度，dueAt=now），再 GET due
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id: bookId } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${bookId}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(bookId, 'ch-1')
    const wrongAnswer = quiz.options.find((option) => option.id !== quiz.correctAnswerId)!.id
    await request(app)
      .post(`/api/books/${bookId}/attempts`)
      .send({ blockId: quiz.id, answerId: wrongAnswer })

    const response = await request(app).get(`/api/books/${bookId}/review/due`)
    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).toMatchObject({ blockId: quiz.id, chapterId: 'ch-1', kind: 'quiz', stage: 0, lapses: 1 })
  })

  it('returns 404 book_not_found for an unknown book id', async () => {
    const app = appWith(chapterAwareFetch())

    const response = await request(app).get('/api/books/book_missing-1/review/due')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'book_not_found' })
  })
})

describe('POST /api/books/:id/review/:blockId/result', () => {
  it('POST review/:blockId/result 对 flash_cards 自评记住了并推进调度', async () => {
    const app = appWith(flashChapterFetch())
    const { id: bookId } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${bookId}/chapters/ch-1/generate`)
    const flash = await flashBlockOf(bookId, 'ch-1')

    const response = await request(app)
      .post(`/api/books/${bookId}/review/${flash.id}/result`)
      .send({ result: 'remembered' })

    expect(response.status).toBe(200)
    expect(response.body.schedule).toMatchObject({ kind: 'flash_cards', stage: 1 })
    expect(response.body).toMatchObject({
      projectionStatus: 'projected',
      evidence: { version: '1', kind: 'review', sourceBlockId: flash.id },
    })

    const stored = await bookStore.get(bookId)
    expect(stored?.reviewSchedule?.[flash.id]).toMatchObject({ kind: 'flash_cards', stage: 1 })
    expect(stored?.evidence).toHaveLength(1)
  })

  it('POST review/:blockId/result 拒绝非闪卡块与非法 result', async () => {
    const app = appWith(flashChapterFetch())
    const { id: bookId } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${bookId}/chapters/ch-1/generate`)
    const quiz = await quizBlockOf(bookId, 'ch-1')
    const flash = await flashBlockOf(bookId, 'ch-1')

    await request(app)
      .post(`/api/books/${bookId}/review/${quiz.id}/result`)
      .send({ result: 'remembered' })
      .expect(409, { error: 'review_target_invalid' })
    await request(app)
      .post(`/api/books/${bookId}/review/${flash.id}/result`)
      .send({ result: 'maybe' })
      .expect(400, { error: 'invalid_request' })
  })
})

describe('POST /api/books/:id/pretest', () => {
  it('生成 5 道摸底题并落盘：形状归一、提示词不含原文页文本', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const res = await request(app).post(`/api/books/${id}/pretest`)

    expect(res.status).toBe(200)
    expect(res.body.result).toBeNull()
    expect(res.body.questions).toHaveLength(5)
    expect(res.body.questions.map((q: { id: string }) => q.id)).toEqual(['pq-1', 'pq-2', 'pq-3', 'pq-4', 'pq-5'])
    expect(res.body.questions[0]).toMatchObject({
      chapterId: 'ch-1',
      correctAnswerId: 'a',
      explanation: '第一章讲解机器学习基础。',
    })
    expect(res.body.questions[0].options).toEqual([
      { id: 'a', marker: 'A', text: '机器学习' },
      { id: 'b', marker: 'B', text: '烹饪技巧' },
    ])

    // 上游请求：1500 tokens / 0.2 / json_object；提示词含目录与目标、不含原文全文
    const pretestCall = fetchImpl.mock.calls.at(-1)!
    const providerBody = JSON.parse(String(pretestCall[1]?.body))
    expect(providerBody).toMatchObject({
      stream: true,
      response_format: { type: 'json_object' },
      max_completion_tokens: 1500,
      temperature: 0.2,
    })
    const serializedMessages = JSON.stringify(providerBody.messages)
    expect(serializedMessages).toContain('第一章')
    expect(serializedMessages).toContain('目标三')
    expect(serializedMessages).not.toContain('【第1页】')
    expect(serializedMessages).not.toContain(API_KEY)

    // 落盘核实
    const saved = await bookStore.get(id)
    expect(saved?.pretest?.questions).toHaveLength(5)
    expect(saved?.pretest?.result).toBeNull()
  })

  it('幂等：已生成时直接返回现存量，不再调上游', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const first = await request(app).post(`/api/books/${id}/pretest`)
    const second = await request(app).post(`/api/books/${id}/pretest`)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
    // 提案 1 次 + 摸底 1 次，第二次走存量
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('proposal 状态返回 409 pretest_unavailable，不调上游', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const created = await request(app)
      .post('/api/books')
      .send({ documentId, goal: '理解概念', learnerLevel: '入门' })
    expect(created.status).toBe(201)

    const res = await request(app).post(`/api/books/${created.body.book.id}/pretest`)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'pretest_unavailable' })
    expect(fetchImpl).toHaveBeenCalledTimes(1) // 仅提案
    expect((await bookStore.get(created.body.book.id))?.pretest).toBeUndefined()
  })

  it('校验失败带修正指令重试一次后成功', async () => {
    const invalidPretest = {
      questions: pretestJson.questions.map((q, index) =>
        index === 0 ? { ...q, chapterId: 'ch-99' } : q),
    }
    const fetchImpl = chapterAwareFetch({
      onPretest: (_body, pretestCalls) => (pretestCalls === 1 ? invalidPretest : pretestJson),
    })
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const res = await request(app).post(`/api/books/${id}/pretest`)

    expect(res.status).toBe(200)
    expect(res.body.questions).toHaveLength(5)
    // 提案 1 次 + 摸底 2 次
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const retryBody = JSON.parse(String(fetchImpl.mock.calls.at(-1)![1]?.body))
    const lastMessage = retryBody.messages.at(-1)
    expect(lastMessage.role).toBe('user')
    expect(lastMessage.content).toContain('上次输出未通过校验')
    expect(lastMessage.content).toContain('pretest_invalid')
  })

  it('两次输出均非法返回 502 upstream_unavailable，不落盘 pretest、不泄密', async () => {
    const fetchImpl = chapterAwareFetch({ onPretest: () => '这不是 JSON' })
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger })
    const { id } = await createConfirmedBook(app)

    const res = await request(app).post(`/api/books/${id}/pretest`)

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'upstream_unavailable' })
    expect(res.text).not.toContain(API_KEY)
    expect((await bookStore.get(id))?.pretest).toBeUndefined()
    expect(JSON.stringify(logger.mock.calls)).not.toContain(API_KEY)
  })

  it('returns 404 book_not_found for an unknown book id', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)

    const res = await request(app).post('/api/books/book_missing-1/pretest')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'book_not_found' })
  })
})

describe('POST /api/books/:id/pretest/result', () => {
  interface PretestQuestionPayload { id: string; chapterId: string; correctAnswerId: string }

  async function bookWithPretest(fetchOverride?: Parameters<typeof chapterAwareFetch>[0]) {
    const fetchImpl = chapterAwareFetch(fetchOverride)
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    const generated = await request(app).post(`/api/books/${id}/pretest`)
    expect(generated.status).toBe(200)
    return { id, app, questions: generated.body.questions as PretestQuestionPayload[] }
  }

  it('全对：三章全进 skippable，建议起点为最后一章，整书返回并落盘', async () => {
    const { id, app, questions } = await bookWithPretest()
    const answers = Object.fromEntries(questions.map((q) => [q.id, q.correctAnswerId]))

    const res = await request(app).post(`/api/books/${id}/pretest/result`).send({ answers })

    expect(res.status).toBe(200)
    expect(res.body.book.pretest.result).toMatchObject({
      answers,
      skippableChapterIds: ['ch-1', 'ch-2', 'ch-3'],
      suggestedStartChapterId: 'ch-3',
    })
    expect(Number.isNaN(Date.parse(res.body.book.pretest.result.submittedAt))).toBe(false)
    expect(res.body.book.chapters).toHaveLength(3)

    const saved = await bookStore.get(id)
    expect(saved?.pretest?.result?.skippableChapterIds).toEqual(['ch-1', 'ch-2', 'ch-3'])
  })

  it('部分对：仅全对章可跳过，建议起点为第一个非可跳过章', async () => {
    const { id, app, questions } = await bookWithPretest()
    const answers = Object.fromEntries(questions.map((q) => [
      q.id,
      q.chapterId === 'ch-1' ? q.correctAnswerId : 'b',
    ]))

    const res = await request(app).post(`/api/books/${id}/pretest/result`).send({ answers })

    expect(res.status).toBe(200)
    expect(res.body.book.pretest.result).toMatchObject({
      skippableChapterIds: ['ch-1'],
      suggestedStartChapterId: 'ch-2',
    })
  })

  it('全错：无章可跳过，建议起点为第一章', async () => {
    const { id, app, questions } = await bookWithPretest()
    const answers = Object.fromEntries(questions.map((q) => [q.id, 'b']))

    const res = await request(app).post(`/api/books/${id}/pretest/result`).send({ answers })

    expect(res.status).toBe(200)
    expect(res.body.book.pretest.result).toMatchObject({
      skippableChapterIds: [],
      suggestedStartChapterId: 'ch-1',
    })
  })

  it('无关联题的章不得进 skippable（LLM 只出了部分章的题）', async () => {
    // 5 题只覆盖 ch-1/ch-2：ch-3 无任何关联题
    const partialPretest = {
      questions: [...pretestJson.questions.slice(0, 4), { ...pretestJson.questions[4], chapterId: 'ch-2' }],
    }
    const { id, app, questions } = await bookWithPretest({ onPretest: () => partialPretest })
    const answers = Object.fromEntries(questions.map((q) => [q.id, q.correctAnswerId]))

    const res = await request(app).post(`/api/books/${id}/pretest/result`).send({ answers })

    expect(res.status).toBe(200)
    expect(res.body.book.pretest.result).toMatchObject({
      skippableChapterIds: ['ch-1', 'ch-2'],
      suggestedStartChapterId: 'ch-3',
    })
  })

  it('未生成摸底时提交返回 409 pretest_unavailable', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)

    const res = await request(app)
      .post(`/api/books/${id}/pretest/result`)
      .send({ answers: { 'pq-1': 'a' } })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'pretest_unavailable' })
  })

  it('returns 400 invalid_request for malformed answers', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    await request(app).post(`/api/books/${id}/pretest`)

    const notRecord = await request(app)
      .post(`/api/books/${id}/pretest/result`)
      .send({ answers: ['a'] })
    expect(notRecord.status).toBe(400)
    expect(notRecord.body).toEqual({ error: 'invalid_request' })

    const nonStringValue = await request(app)
      .post(`/api/books/${id}/pretest/result`)
      .send({ answers: { 'pq-1': 1 } })
    expect(nonStringValue.status).toBe(400)
    expect(nonStringValue.body).toEqual({ error: 'invalid_request' })
  })

  it('returns 404 book_not_found for an unknown book id', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)

    const res = await request(app)
      .post('/api/books/book_missing-1/pretest/result')
      .send({ answers: {} })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'book_not_found' })
  })
})

describe('POST /api/books/:id/chapters/:cid/feynman', () => {
  const explanation = '机器学习就是让计算机从数据里找规律，再用规律做预测。'

  async function readyBook(app: express.Express): Promise<{ id: string }> {
    const { id } = await createConfirmedBook(app)
    const generated = await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    expect(generated.status).toBe(200)
    return { id }
  }

  it('ready 章保留判定字段并落安全结构化证据：800 tokens/json_object，不含密钥或音频', async () => {
    const fetchImpl = chapterAwareFetch()
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger })
    const { id } = await readyBook(app)

    const res = await request(app)
      .post(`/api/books/${id}/chapters/ch-1/feynman`)
      .send({ explanation })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ...feynmanJson,
      projectionStatus: 'projected',
      evidenceId: expect.stringMatching(/^evidence_/),
    })

    // 上游请求：800 tokens / json_object（新档位）
    const feynmanCall = fetchImpl.mock.calls.at(-1)!
    const providerBody = JSON.parse(String(feynmanCall[1]?.body))
    expect(providerBody).toMatchObject({
      response_format: { type: 'json_object' },
      max_completion_tokens: 800,
    })
    const serializedMessages = JSON.stringify(providerBody.messages)
    expect(serializedMessages).toContain('第一章')
    expect(serializedMessages).toContain('目标一')
    expect(serializedMessages).toContain('第1页要点')
    expect(serializedMessages).toContain(explanation)
    expect(serializedMessages).toContain('<document_data>')
    expect(serializedMessages).not.toContain(API_KEY)

    // 只落确认文本摘要和规范化判定，不保存原始音频/模型原始输出
    const saved = await bookStore.get(id)
    expect(saved?.evidence).toHaveLength(1)
    expect(res.body.evidenceId).toBe(saved?.evidence[0]?.id)
    expect(saved?.evidence[0]).toMatchObject({
      version: '1', kind: 'feynman',
      payload: {
        confirmedTextLength: explanation.length,
        passed: true,
        feedbackCategory: 'positive',
        gapCategory: 'none',
      },
    })
    expect(JSON.stringify(saved?.evidence)).not.toContain(explanation)
    expect(JSON.stringify(saved?.evidence)).not.toContain(feynmanJson.feedback)
    expect(JSON.stringify(saved?.evidence)).not.toContain('audio')
    expect(saved?.chapters.find((entry) => entry.id === 'ch-1')?.blocks).toHaveLength(4)
    // 判定留痕
    expect(JSON.stringify(logger.mock.calls)).toContain('feynman_judged')
  })

  it('explanation 缺失、纯空白或超过 2000 字符返回 400 invalid_request，不调上游', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await readyBook(app)
    const upstreamCalls = fetchImpl.mock.calls.length

    const missing = await request(app).post(`/api/books/${id}/chapters/ch-1/feynman`).send({})
    expect(missing.status).toBe(400)
    expect(missing.body).toEqual({ error: 'invalid_request' })

    const blank = await request(app).post(`/api/books/${id}/chapters/ch-1/feynman`).send({ explanation: '   ' })
    expect(blank.status).toBe(400)

    const tooLong = await request(app)
      .post(`/api/books/${id}/chapters/ch-1/feynman`)
      .send({ explanation: '长'.repeat(2001) })
    expect(tooLong.status).toBe(400)

    expect(fetchImpl.mock.calls.length).toBe(upstreamCalls)
  })

  it('explanation 允许恰好 2000 字符（trim 后计数）', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await readyBook(app)

    const res = await request(app)
      .post(`/api/books/${id}/chapters/ch-1/feynman`)
      .send({ explanation: ` ${'讲'.repeat(2000)} ` })

    expect(res.status).toBe(200)
  })

  it('章未生成（pending）返回 409 chapter_not_generatable，不调上游', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await createConfirmedBook(app)
    const upstreamCalls = fetchImpl.mock.calls.length

    const res = await request(app)
      .post(`/api/books/${id}/chapters/ch-1/feynman`)
      .send({ explanation })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'chapter_not_generatable' })
    expect(fetchImpl.mock.calls.length).toBe(upstreamCalls)
  })

  it('缺密钥返回 503 feynman_not_configured', async () => {
    const fetchImpl = chapterAwareFetch()
    const { id } = await readyBook(appWith(fetchImpl))

    // 共享同一对 store 的无密钥 app：建书走有密钥实例，费曼走无密钥实例
    const res = await request(appWith(fetchImpl, { apiKey: '' }))
      .post(`/api/books/${id}/chapters/ch-1/feynman`)
      .send({ explanation })

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'feynman_not_configured' })
  })

  it('校验失败带修正指令重试一次后成功', async () => {
    const fetchImpl = chapterAwareFetch({
      onFeynman: (_body, feynmanCalls) => (feynmanCalls === 1 ? { passed: '讲得对' } : feynmanJson),
    })
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger })
    const { id } = await readyBook(app)

    const res = await request(app)
      .post(`/api/books/${id}/chapters/ch-1/feynman`)
      .send({ explanation })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject(feynmanJson)
    const retryBody = JSON.parse(String(fetchImpl.mock.calls.at(-1)![1]?.body))
    const lastMessage = retryBody.messages.at(-1)
    expect(lastMessage.role).toBe('user')
    expect(lastMessage.content).toContain('上次输出未通过校验')
    expect(lastMessage.content).toContain('feynman_invalid')
    expect(JSON.stringify(logger.mock.calls)).toContain('feynman_validation_failed')
  })

  it('两次输出均非法返回 502 upstream_unavailable，响应与日志不泄密', async () => {
    const fetchImpl = chapterAwareFetch({ onFeynman: () => '这不是 JSON' })
    const logger = vi.fn()
    const app = appWith(fetchImpl, { logger })
    const { id } = await readyBook(app)

    const res = await request(app)
      .post(`/api/books/${id}/chapters/ch-1/feynman`)
      .send({ explanation })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'upstream_unavailable' })
    expect(res.text).not.toContain(API_KEY)
    expect(JSON.stringify(logger.mock.calls)).not.toContain(API_KEY)
  })

  it('未知书/未知章返回 404', async () => {
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl)
    const { id } = await readyBook(app)

    const missingBook = await request(app)
      .post('/api/books/book_missing-1/chapters/ch-1/feynman')
      .send({ explanation })
    expect(missingBook.status).toBe(404)
    expect(missingBook.body).toEqual({ error: 'book_not_found' })

    const missingChapter = await request(app)
      .post(`/api/books/${id}/chapters/ch-99/feynman`)
      .send({ explanation })
    expect(missingChapter.status).toBe(404)
    expect(missingChapter.body).toEqual({ error: 'chapter_not_found' })
  })
})

describe('项目通知挂钩（PR-D）', () => {
  it('章节生成失败产生 chapter_failed 通知；未读期间重试失败不重复', async () => {
    const notices = createNoticeService(dir)
    const fetchImpl = chapterAwareFetch({ onChapter: () => '仍然不是 JSON' })
    const app = appWith(fetchImpl, { notices })
    const { id } = await createConfirmedBook(app)

    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    let list = await notices.list(id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      kind: 'chapter_failed', severity: 'error', readAt: null,
      target: { bookId: id, chapterId: 'ch-1' },
    })
    expect(list[0].message).toContain('机器学习入门')
    expect(list[0].message).toContain('第一章')

    // 重试仍失败：未读期间不刷重复通知
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    list = await notices.list(id)
    expect(list).toHaveLength(1)

    // 已读后再次失败：产生新通知
    await notices.markRead(list[0].id)
    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    list = await notices.list(id)
    expect(list).toHaveLength(2)
  })

  it('章节生成成功产生 chapter_ready；末章完成后追加 book_ready', async () => {
    const notices = createNoticeService(dir)
    const fetchImpl = chapterAwareFetch()
    const app = appWith(fetchImpl, { notices })
    const { id } = await createConfirmedBook(app)

    await request(app).post(`/api/books/${id}/chapters/ch-1/generate`)
    let list = await notices.list(id)
    expect(list.map((notice) => notice.kind)).toEqual(['chapter_ready'])

    await request(app).post(`/api/books/${id}/chapters/ch-2/generate`)
    await request(app).post(`/api/books/${id}/chapters/ch-3/generate`)
    list = await notices.list(id)
    expect(list.filter((notice) => notice.kind === 'chapter_ready')).toHaveLength(3)
    expect(list.filter((notice) => notice.kind === 'book_ready')).toHaveLength(1)
    const saved = await bookStore.get(id)
    expect(saved?.status).toBe('ready')
  })
})
