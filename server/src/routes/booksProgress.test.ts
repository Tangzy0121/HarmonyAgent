import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import type { StoredBook } from '../books/bookTypes.js'
import { createBooksRouter } from './books.js'

function seedBook(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id: 'book_progress',
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount: 4, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: 't', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [
      { id: 'ch-1', title: '第一章', order: 1, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [], status: 'ready', blocks: [] },
      { id: 'ch-2', title: '第二章', order: 2, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [], status: 'ready', blocks: [] },
    ],
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    generationJobs: [],
    ...overrides,
  }
}

let dir: string
let documentStore: DocumentStore
let bookStore: BookStore
let app: express.Express

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'book-progress-route-'))
  documentStore = createDocumentStore(path.join(dir, 'documents'))
  bookStore = createBookStore(path.join(dir, 'books'))
  await bookStore.save(seedBook())
  app = express()
  app.use('/api/books', createBooksRouter({
    documentStore,
    bookStore,
    fetchImpl: vi.fn(),
    env: {},
    logger: vi.fn(),
  }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('POST /api/books/:id/progress', () => {
  it('visit 持久化已读与 lastReadAt，返回 progress 与 completion', async () => {
    const res = await request(app).post('/api/books/book_progress/progress').send({ chapterId: 'ch-1', action: 'visit' })
    expect(res.status).toBe(200)
    expect(res.body.progress.visitedChapterIds).toEqual(['ch-1'])
    expect(typeof res.body.progress.lastReadAt['ch-1']).toBe('string')
    expect(res.body.completion).toMatchObject({ visitedCount: 1, totalChapters: 2, completionScore: 0.2 })

    const reloaded = await request(app).get('/api/books/book_progress')
    expect(reloaded.body.readingProgress.visitedChapterIds).toEqual(['ch-1'])
  })

  it('bookmark/unbookmark 幂等', async () => {
    await request(app).post('/api/books/book_progress/progress').send({ chapterId: 'ch-2', action: 'bookmark' })
    const dup = await request(app).post('/api/books/book_progress/progress').send({ chapterId: 'ch-2', action: 'bookmark' })
    expect(dup.body.progress.bookmarkedChapterIds).toEqual(['ch-2'])
    const off = await request(app).post('/api/books/book_progress/progress').send({ chapterId: 'ch-2', action: 'unbookmark' })
    expect(off.body.progress.bookmarkedChapterIds).toEqual([])
  })

  it('非法 body → 400；书不存在 → 404；章不存在 → 409', async () => {
    expect((await request(app).post('/api/books/book_progress/progress').send({ chapterId: 'ch-1' })).status).toBe(400)
    expect((await request(app).post('/api/books/book_progress/progress').send({ chapterId: '', action: 'visit' })).status).toBe(400)
    expect((await request(app).post('/api/books/book_progress/progress').send({ chapterId: 'ch-1', action: 'fly' })).status).toBe(400)
    expect((await request(app).post('/api/books/book_ghost/progress').send({ chapterId: 'ch-1', action: 'visit' })).status).toBe(404)
    expect((await request(app).post('/api/books/book_progress/progress').send({ chapterId: 'ch-9', action: 'visit' })).status).toBe(409)
  })
})

describe('GET /api/books/:id/completion', () => {
  it('返回派生完成度；零进度书为 0', async () => {
    const empty = await request(app).get('/api/books/book_progress/completion')
    expect(empty.status).toBe(200)
    expect(empty.body.completion).toMatchObject({ completionScore: 0, visitedCount: 0, totalChapters: 2, weakChapters: [] })

    await request(app).post('/api/books/book_progress/progress').send({ chapterId: 'ch-1', action: 'visit' })
    const after = await request(app).get('/api/books/book_progress/completion')
    expect(after.body.completion.completionScore).toBe(0.2)
  })

  it('书不存在 → 404', async () => {
    expect((await request(app).get('/api/books/book_ghost/completion')).status).toBe(404)
  })
})
