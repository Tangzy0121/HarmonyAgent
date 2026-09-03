import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import type { StoredBook } from '../books/bookTypes.js'
import { createLearnerRouter } from './learner.js'

let dir: string
let bookStore: BookStore
let app: express.Express

function seedBook(id: string, label: string, isCorrect: boolean, submittedAt: string): StoredBook {
  return {
    id,
    chapters: [{
      id: 'ch-1', title: '第一章', order: 0, objective: '', coreConceptId: 'c-1', estimatedMinutes: 6,
      sourceAnchors: [], status: 'ready',
      blocks: [
        {
          id: 'blk-concept', type: 'concept', status: 'ready', title: '节点', revision: 1, sourceAnchors: [],
          concepts: [{ id: 'c-1', label, description: '', learningState: '暂无学习记录' }], relations: [],
        },
        {
          id: 'blk-quiz', type: 'quiz', status: 'ready', title: '小测', revision: 1, sourceAnchors: [],
          conceptId: 'c-1', question: '', options: [], correctAnswerId: 'o1', feedback: '',
        },
      ],
    }],
    quizAttempts: [{ id: `att_${id}`, chapterId: 'ch-1', blockId: 'blk-quiz', answerId: 'o1', isCorrect, submittedAt }],
    evidence: [],
    userNotes: [],
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  } as unknown as StoredBook
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'learner-route-'))
  bookStore = createBookStore(path.join(dir, 'books'))
  app = express()
  app.use('/api/learner', createLearnerRouter({ bookStore }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('GET /api/learner/profile', () => {
  it('returns an empty profile when there are no books', async () => {
    const res = await request(app).get('/api/learner/profile')

    expect(res.status).toBe(200)
    expect(res.body.concepts).toEqual([])
    expect(res.body.rhythm.activeDays30).toBe(0)
    expect(typeof res.body.derivedAt).toBe('string')
  })

  it('derives a cross-book profile from stored books', async () => {
    await bookStore.save(seedBook('book_1', '监督学习', true, '2026-08-10T10:00:00.000Z'))
    await bookStore.save(seedBook('book_2', ' 监督学习 ', false, '2026-08-12T10:00:00.000Z'))

    const res = await request(app).get('/api/learner/profile')

    expect(res.status).toBe(200)
    expect(res.body.concepts).toHaveLength(1)
    expect(res.body.concepts[0].label).toBe('监督学习')
    expect(res.body.concepts[0].attempts).toBe(2)
    expect(res.body.concepts[0].sources).toHaveLength(2)
  })
})

describe('GET /api/learner/suggestions', () => {
  it('returns an empty list when there are no books', async () => {
    const res = await request(app).get('/api/learner/suggestions')

    expect(res.status).toBe(200)
    expect(res.body.suggestions).toEqual([])
  })

  it('returns a weak-concept suggestion with book title for answered books', async () => {
    const weak = seedBook('book_1', '梯度下降', false, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    weak.proposal = { title: '机器学习', description: '', rationale: '', estimatedMinutes: 30 }
    await bookStore.save(weak)

    const res = await request(app).get('/api/learner/suggestions')

    expect(res.status).toBe(200)
    expect(res.body.suggestions.length).toBeGreaterThan(0)
    expect(res.body.suggestions.length).toBeLessThanOrEqual(3)
    expect(res.body.suggestions[0]).toMatchObject({ kind: 'weak', bookId: 'book_1', conceptLabel: '梯度下降' })
    expect(res.body.suggestions[0].text).toContain('机器学习')
  })
})
