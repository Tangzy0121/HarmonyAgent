import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'

import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import { createDocumentsRouter } from './documents.js'

let dir: string
let app: express.Express

const LONG_TEXT = `机器学习讲义正文。${'这是用于测试虚拟分页的段落内容，涵盖监督学习与无监督学习。'.repeat(20)}\n\n`.repeat(30)

async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  const body = paragraphs.map((text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join('')
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** 程序生成最小 EPUB 夹具：mimetype + container.xml + content.opf + 一个 xhtml 章节 */
async function makeEpub(body: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip')
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <manifest><item id="chap-1" href="one.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chap-1"/></spine>
</package>`)
  zip.file('OEBPS/one.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>one</title></head><body>${body}</body></html>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'documents-formats-'))
  const store: DocumentStore = createDocumentStore(dir)
  app = express()
  app.use('/api/documents', createDocumentsRouter({ store }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('documents routes · 多格式', () => {
  it('POST markdown returns 200 with virtual page count and Markdown format', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'text/markdown')
      .set('x-file-name', encodeURIComponent('讲义.md'))
      .send(LONG_TEXT)

    expect(res.status).toBe(200)
    expect(res.body.pageCount).toBeGreaterThanOrEqual(2)
    expect(res.body.format).toBe('Markdown')
  })

  it('POST markdown with frontmatter strips it before paging', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'text/markdown')
      .set('x-file-name', 'notes.md')
      .send(`---\ntitle: t\n---\n\n${LONG_TEXT}`)

    expect(res.status).toBe(200)
    const list = await request(app).get('/api/documents')
    expect(list.body[0].fileName).toBe('notes.md')
  })

  it('POST markdown below the text floor returns 422 doc_no_text', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'text/markdown')
      .set('x-file-name', 'short.md')
      .send('太短')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'doc_no_text' })
  })

  it('POST markdown over the character limit returns 422 doc_too_long', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'text/markdown')
      .set('x-file-name', 'huge.md')
      .send('字'.repeat(45_500))

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'doc_too_long' })
  })

  it('POST docx returns 200 with DOCX format', async () => {
    const buf = await makeDocx([LONG_TEXT])
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .set('x-file-name', 'chapter.docx')
      .send(buf)

    expect(res.status).toBe(200)
    expect(res.body.format).toBe('DOCX')
    expect(res.body.pageCount).toBeGreaterThanOrEqual(1)
  })

  it('POST a corrupted docx returns 422 docx_unreadable', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .set('x-file-name', 'broken.docx')
      .send(Buffer.from('definitely not a zip'))

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'docx_unreadable' })
  })

  it('POST epub returns 200 with EPUB format', async () => {
    const buf = await makeEpub(`<p>${LONG_TEXT}</p>`)
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/epub+zip')
      .set('x-file-name', 'chapter.epub')
      .send(buf)

    expect(res.status).toBe(200)
    expect(res.body.format).toBe('EPUB')
    expect(res.body.pageCount).toBeGreaterThanOrEqual(1)
  })

  it('POST a corrupted epub returns 422 epub_unreadable', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/epub+zip')
      .set('x-file-name', 'broken.epub')
      .send(Buffer.from('definitely not a zip'))

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'epub_unreadable' })
  })

  it('POST epub as octet-stream dispatches by file extension', async () => {
    const buf = await makeEpub(`<p>${LONG_TEXT}</p>`)
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/octet-stream')
      .set('x-file-name', encodeURIComponent('讲义.epub'))
      .send(buf)

    expect(res.status).toBe(200)
    expect(res.body.format).toBe('EPUB')
  })

  it('POST octet-stream dispatches by file extension', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/octet-stream')
      .set('x-file-name', encodeURIComponent('讲义.markdown'))
      .send(LONG_TEXT)

    expect(res.status).toBe(200)
    expect(res.body.format).toBe('Markdown')
  })

  it('POST with an unrelated Content-Type still returns 400 invalid_content_type', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/json')
      .send({ hello: 'world' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_content_type' })
  })
})
