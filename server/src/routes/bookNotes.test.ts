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

const chapterBlocksJson = (page: number) => ({
  blocks: [
    { type: 'explanation', title: '本章讲解', body: `围绕第${page}页内容展开讲解。`, keyPoint: `第${page}页要点` },
    { type: 'citation', title: '原文引文', excerpt: `机器学习的第${page}部分讲解内容`, pageRange: String(page) },
    {
      type: 'quiz',
      title: '随堂小测',
      conceptId: 'c1',
      question: `第${page}部分讲了什么？`,
      options: [{ id: 'o1', text: '机器学习' }, { id: 'o2', text: '烹饪技巧' }],
      correctAnswerId: 'o1',
      feedback: `第${page}页讲解的是机器学习。`,
    },
    { type: 'example', title: '本章示例', scenario: `第${page}页内容的应用示例。`, takeaway: `第${page}页示例要点` },
  ],
})

function upstreamJsonStream(payload: unknown): Response {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

let dir: string
let documentStore: DocumentStore
let bookStore: BookStore
let documentId: string
let app: express.Express
let bookId: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'book-notes-route-'))
  documentStore = createDocumentStore(path.join(dir, 'documents'))
  bookStore = createBookStore(path.join(dir, 'books'))
  const meta = await documentStore.save({ fileName: 'lecture.pdf', pdf: Buffer.from('%PDF-fake-bytes'), parsed })
  documentId = meta.id

  // 提案走 1500 tokens；章生成走 6000 tokens，按「本章标题」给对应页的引文
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    if (body.max_completion_tokens === 6000) {
      const serialized = JSON.stringify(body.messages)
      const page = serialized.includes('本章标题：第一章')
        ? 1
        : serialized.includes('本章标题：第二章')
          ? 3
          : 5
      return upstreamJsonStream(chapterBlocksJson(page))
    }
    return upstreamJsonStream(proposalJson)
  })
  app = express()
  app.use('/api/books', createBooksRouter({
    documentStore,
    bookStore,
    fetchImpl,
    env: { LLM_API_KEY: API_KEY, LLM_BASE_URL: 'https://api.deepseek.example/', LLM_MODEL: '' },
    logger: vi.fn(),
  }))

  const created = await request(app).post('/api/books').send({ documentId, goal: '理解概念', learnerLevel: '入门' })
  bookId = created.body.book.id
  await request(app).post(`/api/books/${bookId}/confirm`).send({})
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function generateChapter(chapterId: string) {
  const res = await request(app).post(`/api/books/${bookId}/chapters/${chapterId}/generate`).send({})
  expect(res.status).toBe(200)
}

async function firstBlockIdOf(chapterId: string): Promise<string> {
  const res = await request(app).get(`/api/books/${bookId}`)
  const chapter = res.body.chapters.find((entry: { id: string }) => entry.id === chapterId)
  return chapter.blocks[0].id
}

describe('POST /api/books/:id/notes', () => {
  it('persists a note on an existing block and returns 201', async () => {
    await generateChapter('ch-1')
    const blockId = await firstBlockIdOf('ch-1')

    const res = await request(app)
      .post(`/api/books/${bookId}/notes`)
      .send({ chapterId: 'ch-1', blockId, body: '这个例子可以类比成教小孩认猫。' })

    expect(res.status).toBe(201)
    expect(res.body.note).toMatchObject({ chapterId: 'ch-1', blockId, body: '这个例子可以类比成教小孩认猫。' })
    expect(typeof res.body.note.id).toBe('string')
    expect(typeof res.body.note.createdAt).toBe('string')

    const reloaded = await request(app).get(`/api/books/${bookId}`)
    expect(reloaded.body.userNotes).toHaveLength(1)
    expect(reloaded.body.userNotes[0].id).toBe(res.body.note.id)
  })

  it('rejects invalid payloads with 400', async () => {
    const res = await request(app).post(`/api/books/${bookId}/notes`).send({ chapterId: 'ch-1', blockId: 'blk-x', body: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_request')
  })

  it('returns 404 for an unknown book', async () => {
    const res = await request(app).post('/api/books/book_missing/notes').send({ chapterId: 'ch-1', blockId: 'blk-x', body: '笔记' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('book_not_found')
  })

  it('returns 409 when the block does not exist in the chapter', async () => {
    await generateChapter('ch-1')
    const res = await request(app).post(`/api/books/${bookId}/notes`).send({ chapterId: 'ch-1', blockId: 'blk-missing', body: '笔记' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('block_not_found')
  })

  it('rejects regenerating a ready chapter (409), so notes on ready blocks cannot be wiped', async () => {
    await generateChapter('ch-1')
    const res = await request(app).post(`/api/books/${bookId}/chapters/ch-1/generate`).send({})
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('chapter_not_generatable')
  })

  it('survives subsequent chapter generation: notes are book-level user data, untouched by chapter flows', async () => {
    await generateChapter('ch-1')
    const blockId = await firstBlockIdOf('ch-1')
    const noted = await request(app).post(`/api/books/${bookId}/notes`).send({ chapterId: 'ch-1', blockId, body: '后续生成也要留住我' })
    expect(noted.status).toBe(201)

    await generateChapter('ch-2')
    await generateChapter('ch-3')

    const reloaded = await request(app).get(`/api/books/${bookId}`)
    expect(reloaded.body.userNotes).toHaveLength(1)
    expect(reloaded.body.userNotes[0].body).toBe('后续生成也要留住我')
  })
})

describe('DELETE /api/books/:id/notes/:noteId', () => {
  it('deletes an existing note with 204', async () => {
    await generateChapter('ch-1')
    const blockId = await firstBlockIdOf('ch-1')
    const noted = await request(app).post(`/api/books/${bookId}/notes`).send({ chapterId: 'ch-1', blockId, body: '待删除' })

    const res = await request(app).delete(`/api/books/${bookId}/notes/${noted.body.note.id}`)
    expect(res.status).toBe(204)

    const reloaded = await request(app).get(`/api/books/${bookId}`)
    expect(reloaded.body.userNotes).toHaveLength(0)
  })

  it('returns 404 for an unknown note', async () => {
    const res = await request(app).delete(`/api/books/${bookId}/notes/note_missing`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('note_not_found')
  })
})
