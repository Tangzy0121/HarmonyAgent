import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import type { StoredBook } from '../books/bookTypes.js'
import { createTodayStore, type TodayStore } from '../today/todayStore.js'
import { createTodayRouter } from './today.js'

const NOW = new Date('2026-08-15T10:00:00.000Z')

function seedBook(id: string, overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id,
    source: { id: `doc_${id}`, fileName: 'a.pdf', format: 'PDF', pageCount: 4, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: `书 ${id}`, description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [
      { id: 'ch-1', title: '第一章', order: 1, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [], status: 'ready', blocks: [] },
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
let bookStore: BookStore
let todayStore: TodayStore
let app: express.Express
let clock: Date

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'today-route-'))
  bookStore = createBookStore(path.join(dir, 'books'))
  todayStore = createTodayStore(dir)
  clock = new Date(NOW)
  app = express()
  app.use(express.json())
  app.use('/api/today', createTodayRouter({ bookStore, todayStore, now: () => clock }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('GET /api/today', () => {
  it('空库：primary 为 null、备选为空', async () => {
    const res = await request(app).get('/api/today')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ version: '1', primary: null, alternatives: [] })
  })

  it('到期复习成为主推荐', async () => {
    await bookStore.save(seedBook('book_a', {
      reviewSchedule: { b1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' } },
    }))
    await bookStore.save(seedBook('book_b'))
    const res = await request(app).get('/api/today')
    expect(res.body.primary).toMatchObject({ action: 'review_due', bookId: 'book_a', rank: 'primary' })
    expect(res.body.alternatives).toHaveLength(2)
    // 两书都满足继续阅读（均有未读章节）；book_a 最近学习更近，排在前
    expect(res.body.alternatives[0]).toMatchObject({ action: 'continue_reading', bookId: 'book_a', rank: 'alternative' })
    expect(res.body.alternatives[1]).toMatchObject({ action: 'continue_reading', bookId: 'book_b', rank: 'alternative' })
  })
})

describe('POST /api/today/state', () => {
  it('dismiss 后该推荐不再出现；其他推荐不受影响', async () => {
    await bookStore.save(seedBook('book_a', {
      reviewSchedule: { b1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' } },
    }))
    const before = await request(app).get('/api/today')
    const id = before.body.primary.id

    const dismiss = await request(app).post('/api/today/state').send({ recommendationId: id, state: 'dismissed' })
    expect(dismiss.status).toBe(200)
    expect(dismiss.body).toEqual({ version: '1', recommendationId: id, state: 'dismissed' })

    const after = await request(app).get('/api/today')
    expect(after.body.primary).toMatchObject({ action: 'continue_reading', bookId: 'book_a' })
  })

  it('snoozed 到点前隐藏、到点后恢复', async () => {
    await bookStore.save(seedBook('book_a', {
      reviewSchedule: { b1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' } },
    }))
    const before = await request(app).get('/api/today')
    const id = before.body.primary.id
    await request(app).post('/api/today/state').send({ recommendationId: id, state: 'snoozed' }) // 默认 +4h

    const snoozed = await request(app).get('/api/today')
    expect(snoozed.body.primary).toMatchObject({ action: 'continue_reading' })

    clock = new Date(NOW.getTime() + 5 * 60 * 60 * 1000) // 5 小时后
    const restored = await request(app).get('/api/today')
    expect(restored.body.primary).toMatchObject({ action: 'review_due', id })
  })

  it('非法 body → 400 invalid_request；状态落盘持久', async () => {
    const bad = await request(app).post('/api/today/state').send({ state: 'nope' })
    expect(bad.status).toBe(400)

    await request(app).post('/api/today/state').send({ recommendationId: 'rec_x', state: 'completed' })
    const reloaded = createTodayStore(dir)
    expect((await reloaded.get('rec_x'))?.state).toBe('completed')
  })

  it('dismiss 不改变学习事实（书内容零变化）', async () => {
    const book = seedBook('book_a', {
      reviewSchedule: { b1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' } },
    })
    await bookStore.save(book)
    const before = await request(app).get('/api/today')
    await request(app).post('/api/today/state').send({ recommendationId: before.body.primary.id, state: 'dismissed' })
    const stored = await bookStore.get('book_a')
    expect(JSON.stringify(stored)).toBe(JSON.stringify(book))
  })
})
