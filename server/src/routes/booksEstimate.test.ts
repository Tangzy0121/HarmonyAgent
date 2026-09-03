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

let dir: string
let documentStore: DocumentStore
let bookStore: BookStore
let app: express.Express

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'book-estimate-route-'))
  documentStore = createDocumentStore(path.join(dir, 'documents'))
  bookStore = createBookStore(path.join(dir, 'books'))
  await bookStore.save({
    id: 'book_est',
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount: 12, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: 't', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'proposal',
    chapters: [
      { id: 'ch-1', title: '第一章', order: 1, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [{ sourceId: 'doc_1', fileName: 'a.pdf', pageRange: '1-4', excerpt: '' }], status: 'pending', blocks: [] },
      { id: 'ch-2', title: '第二章', order: 2, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [{ sourceId: 'doc_1', fileName: 'a.pdf', pageRange: '5-12', excerpt: '' }], status: 'pending', blocks: [] },
    ],
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    generationJobs: [],
  } as StoredBook)
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

describe('GET /api/books/:id/estimate', () => {
  it('返回逐章估算与合计（合计=各章之和）', async () => {
    const res = await request(app).get('/api/books/book_est/estimate')
    expect(res.status).toBe(200)
    expect(res.body.estimate.chapters).toHaveLength(2)
    expect(res.body.estimate.chapters[0]).toMatchObject({ chapterId: 'ch-1', title: '第一章' })
    expect(res.body.estimate.chapters[0].estimatedTokens).toBe(4 * 800 + 6000)
    expect(res.body.estimate.chapters[1].estimatedTokens).toBe(8 * 800 + 6000)
    expect(res.body.estimate.totalTokens).toBe(
      res.body.estimate.chapters.reduce((sum: number, entry: { estimatedTokens: number }) => sum + entry.estimatedTokens, 0),
    )
  })

  it('书不存在 → 404', async () => {
    expect((await request(app).get('/api/books/book_ghost/estimate')).status).toBe(404)
  })
})
