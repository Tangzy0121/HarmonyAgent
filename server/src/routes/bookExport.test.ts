import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import type { StoredBook } from '../books/bookTypes.js'
import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import { createBooksRouter } from './books.js'

let dir: string
let bookStore: BookStore
let app: express.Express

const book: StoredBook = {
  id: 'book_export1',
  source: { id: 'doc_1', fileName: 'ml.pdf', format: 'PDF', pageCount: 20, sizeLabel: '1 MB', updatedLabel: '今天' },
  goal: '理解概念',
  learnerLevel: '入门',
  proposal: { title: '机器学习入门', description: 'd', rationale: 'r', estimatedMinutes: 30 },
  status: 'ready',
  chapters: [{
    id: 'ch-1', title: '监督学习', order: 1, objective: '目标', coreConceptId: 'c-1', estimatedMinutes: 6,
    sourceAnchors: [], status: 'ready',
    blocks: [{
      id: 'blk-1', type: 'explanation', status: 'ready', title: '讲解', revision: 1, sourceAnchors: [],
      body: '监督学习用带标签的数据训练。', keyPoint: '标签是关键',
    }],
  }],
  activeChapterId: 'ch-1',
  userNotes: [{ id: 'note_1', chapterId: 'ch-1', blockId: 'blk-1', body: '类比：老师批改作业。', createdAt: '2026-08-16T01:00:00.000Z' }],
  quizAttempts: [],
  evidence: [],
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-16T01:00:00.000Z',
  generationJobs: [],
} as unknown as StoredBook

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'book-export-route-'))
  const documentStore: DocumentStore = createDocumentStore(path.join(dir, 'documents'))
  bookStore = createBookStore(path.join(dir, 'books'))
  await bookStore.save(structuredClone(book))
  app = express()
  app.use('/api/books', createBooksRouter({
    documentStore,
    bookStore,
    fetchImpl: vi.fn<typeof fetch>(),
    env: { LLM_API_KEY: '', LLM_BASE_URL: '', LLM_MODEL: '' },
    logger: vi.fn(),
  }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('GET /api/books/:id/export', () => {
  it('returns the book as a Markdown attachment', async () => {
    const res = await request(app).get('/api/books/book_export1/export')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/markdown')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.headers['content-disposition']).toContain('.md')
    expect(res.text).toContain('# 《机器学习入门》')
    expect(res.text).toContain('## 第 1 章 监督学习')
    expect(res.text).toContain('监督学习用带标签的数据训练。')
    expect(res.text).toContain('> 类比：老师批改作业。')
  })

  it('returns 404 for an unknown book', async () => {
    const res = await request(app).get('/api/books/book_missing/export')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('book_not_found')
  })
})
