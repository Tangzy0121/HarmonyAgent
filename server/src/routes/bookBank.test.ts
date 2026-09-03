import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import type { UserCard } from '../books/bookTypes.js'
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
      type: 'quiz', title: '随堂小测', conceptId: 'c1', question: `第${page}部分讲了什么？`,
      options: [{ id: 'o1', text: '机器学习' }, { id: 'o2', text: '烹饪技巧' }],
      correctAnswerId: 'o1', feedback: `第${page}页讲解的是机器学习。`,
    },
    { type: 'example', title: '本章示例', scenario: `第${page}页内容的应用示例。`, takeaway: `第${page}页示例要点` },
  ],
})

function upstreamJsonStream(payload: unknown): Response {
  const text = JSON.stringify(payload)
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
let bookStore: BookStore
let app: express.Express
let bookId: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'book-bank-route-'))
  const documentStore: DocumentStore = createDocumentStore(path.join(dir, 'documents'))
  bookStore = createBookStore(path.join(dir, 'books'))
  const meta = await documentStore.save({ fileName: 'lecture.pdf', pdf: Buffer.from('%PDF-fake-bytes'), parsed })

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

  const created = await request(app).post('/api/books').send({ documentId: meta.id, goal: '理解概念', learnerLevel: '入门' })
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

async function firstQuizOf(chapterId: string): Promise<{ id: string; correctAnswerId: string }> {
  const res = await request(app).get(`/api/books/${bookId}`)
  const chapter = res.body.chapters.find((entry: { id: string }) => entry.id === chapterId)
  return chapter.blocks.find((block: { type: string }) => block.type === 'quiz')
}

describe('GET /api/books/:id/bank', () => {
  it('lists quiz items with attempt stats, wrong first', async () => {
    await generateChapter('ch-1')
    const quiz = await firstQuizOf('ch-1')

    let res = await request(app).get(`/api/books/${bookId}/bank`)
    expect(res.status).toBe(200)
    const quizItem = res.body.items.find((item: { kind: string }) => item.kind === 'quiz')
    expect(quizItem).toMatchObject({ blockId: quiz.id, attempts: 0, lastCorrect: null, wrong: false })

    // 答错一次 → 错题优先
    await request(app).post(`/api/books/${bookId}/attempts`).send({ blockId: quiz.id, answerId: 'o2' })
    res = await request(app).get(`/api/books/${bookId}/bank`)
    const wrongItem = res.body.items.find((item: { kind: string }) => item.kind === 'quiz')
    expect(wrongItem).toMatchObject({ attempts: 1, lastCorrect: false, wrong: true })
  })

  it('returns 404 for an unknown book', async () => {
    const res = await request(app).get('/api/books/book_missing/bank')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('book_not_found')
  })
})

describe('POST /api/books/:id/cards', () => {
  it('persists a user card and includes it in the bank', async () => {
    const res = await request(app)
      .post(`/api/books/${bookId}/cards`)
      .send({ chapterId: 'ch-1', front: '什么是监督学习？', back: '带标签的学习', hint: '第 1 页' })

    expect(res.status).toBe(201)
    expect(res.body.card).toMatchObject({ chapterId: 'ch-1', front: '什么是监督学习？', back: '带标签的学习', hint: '第 1 页' })

    const bank = await request(app).get(`/api/books/${bookId}/bank`)
    const cardItem = bank.body.items.find((item: { blockId: string }) => item.blockId === res.body.card.id)
    expect(cardItem).toMatchObject({ kind: 'flash_cards', chapterId: 'ch-1' })
  })

  it('rejects invalid payloads and unknown chapters', async () => {
    const bad = await request(app).post(`/api/books/${bookId}/cards`).send({ chapterId: 'ch-1', front: '  ', back: '答案' })
    expect(bad.status).toBe(400)

    const wrongChapter = await request(app).post(`/api/books/${bookId}/cards`).send({ chapterId: 'ch-9', front: '问', back: '答' })
    expect(wrongChapter.status).toBe(409)
    expect(wrongChapter.body.error).toBe('chapter_not_found')
  })

  it('caps user cards at 100 per book', async () => {
    await bookStore.update(bookId, (book) => {
      book.userCards = Array.from({ length: 100 }, (_, i): UserCard => ({
        id: `card_seed${i}`, chapterId: 'ch-1', front: `问${i}`, back: `答${i}`, createdAt: '2026-08-16T00:00:00.000Z',
      }))
    })

    const res = await request(app).post(`/api/books/${bookId}/cards`).send({ chapterId: 'ch-1', front: '第 101 张', back: '答' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('card_limit_reached')
  })

  it('user cards survive subsequent chapter generation (user data, not regenerable)', async () => {
    const created = await request(app).post(`/api/books/${bookId}/cards`).send({ chapterId: 'ch-1', front: '留住我', back: '答' })
    expect(created.status).toBe(201)

    await generateChapter('ch-2')
    await generateChapter('ch-3')

    const reloaded = await request(app).get(`/api/books/${bookId}`)
    expect(reloaded.body.userCards).toHaveLength(1)
    expect(reloaded.body.userCards[0].front).toBe('留住我')
  })
})

describe('user card review flow', () => {
  it('due user cards appear in review/due and accept review results', async () => {
    const created = await request(app).post(`/api/books/${bookId}/cards`).send({ chapterId: 'ch-1', front: '到期卡', back: '答' })
    const cardId = created.body.card.id
    // 先评一次「没记住」→ 进入调度（stage 1，1 天后到期）
    const graded = await request(app).post(`/api/books/${bookId}/review/${cardId}/result`).send({ result: 'forgotten' })
    expect(graded.status).toBe(200)

    // 把到期时间改到过去，验证 due 列表收录问答卡
    await bookStore.update(bookId, (book) => {
      const entry = book.reviewSchedule?.[cardId]
      if (entry) entry.dueAt = '2020-01-01T00:00:00.000Z'
    })
    const due = await request(app).get(`/api/books/${bookId}/review/due`)
    expect(due.status).toBe(200)
    const item = due.body.items.find((entry: { blockId: string }) => entry.blockId === cardId)
    expect(item).toMatchObject({ kind: 'flash_cards', chapterId: 'ch-1' })

    // 「没记住」重置到 stage 0 →「记住了」推进到 stage 1
    const remembered = await request(app).post(`/api/books/${bookId}/review/${cardId}/result`).send({ result: 'remembered' })
    expect(remembered.status).toBe(200)
    const after = await request(app).get(`/api/books/${bookId}`)
    expect(after.body.reviewSchedule[cardId].stage).toBe(1)
  })
})
