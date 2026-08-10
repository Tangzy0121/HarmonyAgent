import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import type { ParsedDocument } from '../documents/pdfParser.js'
import { createBooksRouter } from './books.js'

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
  options: { apiKey?: string; logger?: (event: unknown) => void } = {},
) {
  const app = express()
  app.use('/api/books', createBooksRouter({
    documentStore,
    bookStore,
    fetchImpl,
    env: {
      LLM_API_KEY: options.apiKey ?? API_KEY,
      LLM_BASE_URL: 'https://api.deepseek.example/',
      LLM_MODEL: '',
    },
    logger: options.logger ?? vi.fn(),
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
