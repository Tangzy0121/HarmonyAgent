import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDocumentStore } from '../documents/documentStore.js'
import { createNoticeService, type NoticeService } from '../notices/noticeService.js'
import { createDocumentsRouter } from './documents.js'
import { createNoticesRouter } from './notices.js'

let dir: string
let noticeService: NoticeService
let app: express.Express

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'notices-route-'))
  noticeService = createNoticeService(dir)
  app = express()
  app.use('/api/notices', createNoticesRouter({ noticeService }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('GET /api/notices', () => {
  it('空列表', async () => {
    const res = await request(app).get('/api/notices')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ version: '1', notices: [] })
  })

  it('按 bookId 过滤', async () => {
    await noticeService.append({ kind: 'chapter_failed', severity: 'error', message: 'a', target: { bookId: 'b1' } })
    await noticeService.append({ kind: 'chapter_ready', severity: 'info', message: 'b', target: { bookId: 'b2' } })
    const res = await request(app).get('/api/notices?bookId=b1')
    expect(res.body.notices).toHaveLength(1)
    expect(res.body.notices[0].target.bookId).toBe('b1')
  })
})

describe('POST /api/notices/:id/read', () => {
  it('标记已读；重复已读幂等；未知 id 404', async () => {
    const { notice } = await noticeService.append({ kind: 'book_ready', severity: 'info', message: 'm', target: { bookId: 'b1' } })
    const res = await request(app).post(`/api/notices/${notice.id}/read`)
    expect(res.status).toBe(200)
    expect(res.body.notice.readAt).not.toBeNull()

    const again = await request(app).post(`/api/notices/${notice.id}/read`)
    expect(again.status).toBe(200)
    expect(again.body.notice.readAt).toBe(res.body.notice.readAt)

    const missing = await request(app).post('/api/notices/notice_x/read')
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ error: 'notice_not_found' })
  })
})

describe('documents 解析失败挂钩（PR-D）', () => {
  it('解析失败 422 且产生 parse_failed 通知', async () => {
    const hooked = express()
    hooked.use('/api/documents', createDocumentsRouter({
      store: createDocumentStore(path.join(dir, 'documents')),
      notices: noticeService,
    }))
    const res = await request(hooked)
      .post('/api/documents')
      .set('Content-Type', 'application/pdf')
      .set('x-file-name', encodeURIComponent('坏文件.pdf'))
      .send(Buffer.from('%PDF-broken'))
    expect(res.status).toBe(422)

    const notices = await noticeService.list()
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ kind: 'parse_failed', severity: 'error', readAt: null })
    expect(notices[0].message).toContain('坏文件.pdf')
  })
})
