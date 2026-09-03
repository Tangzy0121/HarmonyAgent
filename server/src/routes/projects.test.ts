import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import type { StoredBook } from '../books/bookTypes.js'
import { createProjectsRouter } from './projects.js'

const OWNER = { userId: 'local-user', workspaceId: 'local-workspace' }

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
let app: express.Express

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'projects-route-'))
  bookStore = createBookStore(path.join(dir, 'books'))
  app = express()
  app.use('/api/projects', createProjectsRouter({ bookStore, actorProvider: () => OWNER }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('GET /api/projects', () => {
  it('空库返回空列表', async () => {
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ version: '1', projects: [] })
  })

  it('返回聚合 DTO 并按最近学习降序', async () => {
    await bookStore.save(seedBook('book_old'))
    await bookStore.save(seedBook('book_new', {
      quizAttempts: [{ id: 'a1', chapterId: 'ch-1', blockId: 'b1', answerId: 'A', isCorrect: true, submittedAt: '2026-08-20T00:00:00.000Z' }],
    }))
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body.version).toBe('1')
    expect(res.body.projects.map((project: { projectId: string }) => project.projectId))
      .toEqual(['book_new', 'book_old'])
    const first = res.body.projects[0]
    expect(first.owner).toEqual(OWNER)
    expect(first.documentIds).toEqual(['doc_book_new'])
    expect(first.progress.chaptersReady).toBe(1)
    expect(first.notices).toEqual({ unreadCount: 0 })
  })
})

describe('GET /api/projects/:id', () => {
  it('存在时返回单个项目', async () => {
    await bookStore.save(seedBook('book_one'))
    const res = await request(app).get('/api/projects/book_one')
    expect(res.status).toBe(200)
    expect(res.body.version).toBe('1')
    expect(res.body.project.projectId).toBe('book_one')
    expect(res.body.project.title).toBe('书 book_one')
  })

  it('不存在返回 404 project_not_found', async () => {
    const res = await request(app).get('/api/projects/book_missing')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'project_not_found' })
  })
})
