import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import { createDocumentsRouter, sanitizeFileName } from './documents.js'

async function makePdf(pageTexts: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of pageTexts) {
    const page = doc.addPage([612, 792])
    page.drawText(text, { x: 40, y: 700, size: 12, font })
  }
  return Buffer.from(await doc.save())
}

let dir: string
let store: DocumentStore
let app: express.Express

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'docs-route-'))
  store = createDocumentStore(dir)
  app = express()
  app.use('/api/documents', createDocumentsRouter({ store, logger: () => {} }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('documents routes', () => {
  it('POST /api/documents with a valid PDF returns 200 with document meta', async () => {
    const buf = await makePdf(['hello page one', 'hello page two'])
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/pdf')
      .set('x-file-name', 'chapter1.pdf')
      .send(buf)

    expect(res.status).toBe(200)
    expect(res.body.id).toMatch(/^doc_/u)
    expect(res.body.fileName).toBe('chapter1.pdf')
    expect(res.body.pageCount).toBe(2)
    expect(res.body.sizeBytes).toBe(buf.byteLength)
    expect(typeof res.body.createdAt).toBe('string')
    expect(res.body).not.toHaveProperty('pages')
  })

  it('POST defaults the file name when x-file-name is absent', async () => {
    const buf = await makePdf(['hello'])
    const unnamed = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/pdf')
      .send(buf)
    expect(unnamed.status).toBe(200)
    expect(unnamed.body.fileName).toBe('未命名.pdf')
  })

  it('sanitizeFileName strips control characters and truncates to 120 chars', () => {
    expect(sanitizeFileName('a\u0008c.pdf')).toBe('ac.pdf')
    expect(sanitizeFileName('  report.pdf  ')).toBe('report.pdf')
    expect(sanitizeFileName(`${'x'.repeat(200)}.pdf`)).toHaveLength(120)
    expect(sanitizeFileName('')).toBe('未命名.pdf')
    expect(sanitizeFileName(undefined)).toBe('未命名.pdf')
  })

  it('POST with a non-PDF Content-Type returns 400 invalid_content_type', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/json')
      .send({ hello: 'world' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_content_type' })
  })

  it('POST a 31-page PDF returns 422 pdf_too_many_pages', async () => {
    const buf = await makePdf(Array.from({ length: 31 }, (_, i) => `page ${i}`))
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/pdf')
      .send(buf)

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'pdf_too_many_pages' })
  })

  it('POST over the body limit returns 413 pdf_too_large', async () => {
    const big = Buffer.alloc(21 * 1024 * 1024, 0x41)
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/pdf')
      .send(big)

    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: 'pdf_too_large' })
  })

  it('GET /api/documents lists metas without pages', async () => {
    const buf = await makePdf(['hello page one'])
    await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/pdf')
      .set('x-file-name', 'listed.pdf')
      .send(buf)

    const res = await request(app).get('/api/documents')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].fileName).toBe('listed.pdf')
    expect(res.body[0]).not.toHaveProperty('pages')
  })

  it('DELETE /api/documents/:id removes the document', async () => {
    const buf = await makePdf(['hello page one'])
    const created = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/pdf')
      .send(buf)
    const id = created.body.id as string

    const deleted = await request(app).delete(`/api/documents/${id}`)
    expect(deleted.status).toBe(200)
    expect(deleted.body).toEqual({
      deleted: true,
      note: '原始文件与解析结果已删除',
    })

    await expect(store.get(id)).resolves.toBeNull()
    const list = await request(app).get('/api/documents')
    expect(list.body).toEqual([])

    const again = await request(app).delete(`/api/documents/${id}`)
    expect(again.status).toBe(404)
    expect(again.body).toEqual({ error: 'document_not_found' })
  })
})
