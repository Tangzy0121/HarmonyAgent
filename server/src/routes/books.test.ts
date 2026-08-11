import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import type { ParsedDocument } from '../documents/pdfParser.js'
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
  options: { apiKey?: string; logger?: (event: unknown) => void; chapterTimeoutMs?: number } = {},
) {
  const app = express()
  app.use('/api/books', createBooksRouter({
    documentStore,
    bookStore,
    fetchImpl,
    chapterTimeoutMs: options.chapterTimeoutMs,
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

function chapterAwareFetch(impl: {
  onChapter?: (body: { messages: unknown }, chapterCalls: number) => unknown
} = {}) {
  let chapterCalls = 0
  return vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    if (body.max_completion_tokens !== 6000) return upstreamJsonStream(proposalJson)
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
