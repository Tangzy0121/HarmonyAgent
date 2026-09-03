import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBookStore, type BookStore } from '../books/bookStore.js'
import type { ConceptBlock, StoredBook } from '../books/bookTypes.js'
import { createConceptsRouter } from './concepts.js'

const OWNER = { userId: 'local-user', workspaceId: 'local-workspace' }
const ANCHOR = { sourceId: 'S1', fileName: 'a.pdf', pageRange: '1', excerpt: 'x' }

function conceptBlock(): ConceptBlock {
  return {
    id: 'blk_c1',
    type: 'concept',
    status: 'ready',
    title: '概念',
    revision: 1,
    sourceAnchors: [],
    concepts: [{ id: 'c_1', label: '梯度', description: 'd', learningState: '暂无学习记录' }],
    relations: [
      { id: 'rel_1', sourceId: 'c_1', targetId: 'c_2', type: '应用', confidence: 0.8, status: '候选', sourceAnchor: ANCHOR },
    ],
  }
}

function seedBook(): StoredBook {
  return {
    id: 'book_concepts',
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount: 4, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: 't', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [
      { id: 'ch-1', title: '第一章', order: 1, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [], status: 'ready', blocks: [conceptBlock()] },
    ],
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    generationJobs: [],
  }
}

let dir: string
let bookStore: BookStore
let app: express.Express

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'concepts-route-'))
  bookStore = createBookStore(path.join(dir, 'books'))
  await bookStore.save(seedBook())
  app = express()
  app.use(express.json())
  app.use('/api/books', createConceptsRouter({ bookStore, actorProvider: () => OWNER }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('GET /api/books/:id/concepts', () => {
  it('聚合概念并带定位与 mastery 字段', async () => {
    const res = await request(app).get('/api/books/book_concepts/concepts')
    expect(res.status).toBe(200)
    expect(res.body.version).toBe('1')
    expect(res.body.concepts[0]).toMatchObject({
      id: 'c_1', chapterId: 'ch-1', blockId: 'blk_c1', mastery: null,
    })
  })

  it('未知书返回 404 book_not_found', async () => {
    const res = await request(app).get('/api/books/book_x/concepts')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'book_not_found' })
  })
})

describe('GET /api/books/:id/relations', () => {
  it('聚合关系', async () => {
    const res = await request(app).get('/api/books/book_concepts/relations')
    expect(res.status).toBe(200)
    expect(res.body.relations[0]).toMatchObject({ id: 'rel_1', status: '候选', correctedBy: null })
  })
})

describe('POST /api/books/:id/relations/:rid/corrections', () => {
  it('confirm：201 落纠正，读取投影生效且原始关系不落改', async () => {
    const res = await request(app)
      .post('/api/books/book_concepts/relations/rel_1/corrections')
      .send({ action: 'confirm', note: '看过原文，成立' })
    expect(res.status).toBe(201)
    expect(res.body.correction).toMatchObject({
      relationId: 'rel_1', action: 'confirm', note: '看过原文，成立', operator: OWNER,
    })

    const relations = await request(app).get('/api/books/book_concepts/relations')
    expect(relations.body.relations[0]).toMatchObject({ status: '已确认', correctedBy: res.body.correction.id })

    const stored = await bookStore.get('book_concepts')
    const block = stored?.chapters[0].blocks[0] as ConceptBlock
    expect(block.relations[0].status).toBe('候选') // 原始记录保留
  })

  it('幂等：重复提交返回 200 与既有纠正，不重复记账', async () => {
    const first = await request(app)
      .post('/api/books/book_concepts/relations/rel_1/corrections')
      .send({ action: 'reject' })
    expect(first.status).toBe(201)
    const second = await request(app)
      .post('/api/books/book_concepts/relations/rel_1/corrections')
      .send({ action: 'reject' })
    expect(second.status).toBe(200)
    expect(second.body.correction.id).toBe(first.body.correction.id)
    const stored = await bookStore.get('book_concepts')
    expect(stored?.relationCorrections).toHaveLength(1)
  })

  it('retype 缺 suggestedType 或类型非法 → 400 invalid_correction', async () => {
    const missing = await request(app)
      .post('/api/books/book_concepts/relations/rel_1/corrections')
      .send({ action: 'retype' })
    expect(missing.status).toBe(400)
    const invalid = await request(app)
      .post('/api/books/book_concepts/relations/rel_1/corrections')
      .send({ action: 'retype', suggestedType: 'depends_on' }) // 英文类型未纳入现行受控表
    expect(invalid.status).toBe(400)
    expect(invalid.body).toEqual({ error: 'invalid_correction' })
  })

  it('retype 合法 → 201 且投影改类型', async () => {
    const res = await request(app)
      .post('/api/books/book_concepts/relations/rel_1/corrections')
      .send({ action: 'retype', suggestedType: '对比' })
    expect(res.status).toBe(201)
    const relations = await request(app).get('/api/books/book_concepts/relations')
    expect(relations.body.relations[0]).toMatchObject({ type: '对比', status: '已确认' })
  })

  it('action 非法 → 400；关系不存在 → 404 relation_not_found；书不存在 → 404 book_not_found', async () => {
    const badAction = await request(app)
      .post('/api/books/book_concepts/relations/rel_1/corrections')
      .send({ action: 'delete' })
    expect(badAction.status).toBe(400)

    const missing = await request(app)
      .post('/api/books/book_concepts/relations/rel_x/corrections')
      .send({ action: 'confirm' })
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ error: 'relation_not_found' })

    const noBook = await request(app)
      .post('/api/books/book_x/relations/rel_1/corrections')
      .send({ action: 'confirm' })
    expect(noBook.status).toBe(404)
    expect(noBook.body).toEqual({ error: 'book_not_found' })
  })
})
