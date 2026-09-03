import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import type { QuizBlock, StoredBook } from '../books/bookTypes.js'
import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import { createBooksRouter } from './books.js'

const API_KEY = 'test-only-secret-key'
const SOURCE_BODY = '监督学习依赖带标签的训练数据。模型通过最小化损失函数拟合参数。'

function quizBlock(overrides: Partial<QuizBlock> = {}): QuizBlock {
  return {
    id: 'blk-quiz-1',
    type: 'quiz',
    status: 'ready',
    title: '随堂小测',
    revision: 1,
    sourceAnchors: [],
    conceptId: 'cpt-1',
    question: '监督学习的关键输入是什么？',
    options: [
      { id: 'o1', marker: 'A', text: '带标签数据' },
      { id: 'o2', marker: 'B', text: '奖励信号' },
    ],
    correctAnswerId: 'o1',
    feedback: '监督学习以标签为监督信号。',
    ...overrides,
  }
}

function seedBook(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id: 'book_adaptive',
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount: 4, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: 't', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [
      {
        id: 'ch-1',
        title: '第一章',
        order: 1,
        objective: '',
        coreConceptId: '',
        estimatedMinutes: 10,
        sourceAnchors: [{ sourceId: 'S1', fileName: 'a.pdf', pageRange: '1–2', excerpt: '' }],
        status: 'ready',
        blocks: [
          {
            id: 'blk-exp-1',
            type: 'explanation',
            status: 'ready',
            title: '讲解',
            revision: 1,
            sourceAnchors: [],
            body: SOURCE_BODY,
            keyPoint: '要点',
          },
          {
            id: 'blk-concept-1',
            type: 'concept',
            status: 'ready',
            title: '核心概念',
            revision: 1,
            sourceAnchors: [],
            concepts: [{ id: 'cpt-1', label: '监督学习', description: '用带标签数据训练模型', learningState: '暂无学习记录' }],
            relations: [],
          },
          quizBlock(),
        ],
      },
    ],
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [
      { id: 'att-1', chapterId: 'ch-1', blockId: 'blk-quiz-1', answerId: 'o2', isCorrect: false, submittedAt: '2026-08-16T00:00:00.000Z' },
    ],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    generationJobs: [],
    ...overrides,
  }
}

const adaptiveQuizJson = {
  question: '监督学习的训练数据必须具备什么？',
  options: [
    { id: 'o1', text: '目标标签' },
    { id: 'o2', text: '奖励函数' },
    { id: 'o3', text: '环境状态' },
    { id: 'o4', text: '先验分布' },
  ],
  correctAnswerId: 'o1',
  feedback: '监督学习依赖带标签数据，标签即监督信号。',
  excerpt: '监督学习依赖带标签的训练数据',
}

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
let app: express.Express
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'book-adaptive-quiz-'))
  documentStore = createDocumentStore(path.join(dir, 'documents'))
  bookStore = createBookStore(path.join(dir, 'books'))
  await bookStore.save(seedBook())
  fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => upstreamJsonStream(adaptiveQuizJson))
  app = express()
  app.use('/api/books', createBooksRouter({
    documentStore,
    bookStore,
    fetchImpl,
    env: { LLM_API_KEY: API_KEY, LLM_BASE_URL: 'https://api.deepseek.example/', LLM_MODEL: '' },
    logger: vi.fn(),
  }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('POST /api/books/:id/concepts/:cid/quiz', () => {
  it('201：出题落为章末 origin=adaptive 的 ready quiz 块并持久化，历史错题入 prompt', async () => {
    const res = await request(app).post('/api/books/book_adaptive/concepts/cpt-1/quiz')
    expect(res.status).toBe(201)
    const block = res.body.block
    expect(block).toMatchObject({
      type: 'quiz',
      status: 'ready',
      revision: 1,
      conceptId: 'cpt-1',
      origin: 'adaptive',
      question: adaptiveQuizJson.question,
      correctAnswerId: 'o1',
      sourceAnchors: [{ sourceId: 'S1', fileName: 'a.pdf', pageRange: '1–2', excerpt: '' }],
    })
    expect(block.id).toMatch(/^blk-adaptive-/u)
    expect(block.options.map((option: { marker: string }) => option.marker)).toEqual(['A', 'B', 'C', 'D'])

    // 历史答错记录（question+feedback）进入 prompt
    const upstreamBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    expect(JSON.stringify(upstreamBody.messages)).toContain('监督学习的关键输入是什么？')

    // 持久化：块追加在概念所在章 blocks 末尾
    const reloaded = await request(app).get('/api/books/book_adaptive')
    const chapter = reloaded.body.chapters.find((entry: { id: string }) => entry.id === 'ch-1')
    expect(chapter.blocks.at(-1)).toMatchObject({ id: block.id, origin: 'adaptive' })
    expect(chapter.blocks).toHaveLength(4)
  })

  it('404 book_not_found / 409 concept_not_found', async () => {
    expect((await request(app).post('/api/books/book_ghost/concepts/cpt-1/quiz')).status).toBe(404)
    const res = await request(app).post('/api/books/book_adaptive/concepts/cpt-x/quiz')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('concept_not_found')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('该概念已有 3 个 adaptive 块 → 409 adaptive_limit_reached，不调上游', async () => {
    await bookStore.update('book_adaptive', (current) => {
      for (let index = 0; index < 3; index += 1) {
        current.chapters[0].blocks.push(quizBlock({
          id: `blk-adaptive-seed-${index}`,
          conceptId: 'cpt-1',
          origin: 'adaptive',
        }))
      }
    })
    const res = await request(app).post('/api/books/book_adaptive/concepts/cpt-1/quiz')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('adaptive_limit_reached')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('其他概念的 adaptive 块不占本概念额度', async () => {
    await bookStore.update('book_adaptive', (current) => {
      for (let index = 0; index < 3; index += 1) {
        current.chapters[0].blocks.push(quizBlock({
          id: `blk-adaptive-other-${index}`,
          conceptId: 'cpt-other',
          origin: 'adaptive',
        }))
      }
    })
    const res = await request(app).post('/api/books/book_adaptive/concepts/cpt-1/quiz')
    expect(res.status).toBe(201)
  })

  it('LLM 连续坏输出（excerpt 非源文子串）→ 重试 1 次后 502，不落任何块', async () => {
    fetchImpl.mockImplementation(async () => upstreamJsonStream({ ...adaptiveQuizJson, excerpt: '强化学习依赖奖励信号' }))
    const res = await request(app).post('/api/books/book_adaptive/concepts/cpt-1/quiz')
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('adaptive_quiz_failed')
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    const reloaded = await request(app).get('/api/books/book_adaptive')
    const chapter = reloaded.body.chapters.find((entry: { id: string }) => entry.id === 'ch-1')
    expect(chapter.blocks).toHaveLength(3)
  })

  it('第一次坏输出、第二次修正 → 201', async () => {
    fetchImpl
      .mockImplementationOnce(async () => upstreamJsonStream({ ...adaptiveQuizJson, excerpt: '不存在的句子' }))
      .mockImplementationOnce(async () => upstreamJsonStream(adaptiveQuizJson))
    const res = await request(app).post('/api/books/book_adaptive/concepts/cpt-1/quiz')
    expect(res.status).toBe(201)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('未配置 LLM_API_KEY → 503 adaptive_quiz_not_configured，不调上游', async () => {
    const noKeyApp = express()
    noKeyApp.use('/api/books', createBooksRouter({
      documentStore,
      bookStore,
      fetchImpl,
      env: {},
      logger: vi.fn(),
    }))
    const res = await request(noKeyApp).post('/api/books/book_adaptive/concepts/cpt-1/quiz')
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('adaptive_quiz_not_configured')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('答题链路兼容：生成的 adaptive 块可正常 POST /:id/attempts', async () => {
    const created = await request(app).post('/api/books/book_adaptive/concepts/cpt-1/quiz')
    expect(created.status).toBe(201)
    const blockId = created.body.block.id

    const attempt = await request(app)
      .post('/api/books/book_adaptive/attempts')
      .send({ blockId, answerId: 'o1' })
    expect(attempt.status).toBe(201)
    expect(attempt.body.attempt).toMatchObject({ blockId, answerId: 'o1', isCorrect: true })
  })
})
