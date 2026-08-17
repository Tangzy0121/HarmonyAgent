import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fingerprintOf } from '../books/bookSources.js'
import { createBookStore, type BookStore } from '../books/bookStore.js'
import { createDocumentStore, type DocumentStore } from '../documents/documentStore.js'
import type { ParsedDocument, ParsedPage } from '../documents/pdfParser.js'
import { createBooksRouter } from './books.js'

const API_KEY = 'test-only-secret-key'

// 双源夹具：pdf + md 各 2 页、每页约 100 字（两份合计约 400 字）
const pdfParsed: ParsedDocument = {
  pageCount: 2,
  pages: [1, 2].map((page) => ({
    page,
    text: `讲义第${page}页：${'监督学习与回归分类基础内容。'.repeat(5)}`,
  })),
}
const mdParsed: ParsedDocument = {
  pageCount: 2,
  pages: [1, 2].map((page) => ({
    page,
    text: `笔记第${page}页：${'贝叶斯公式与先验后验概率详解。'.repeat(5)}`,
  })),
}

const fullTextOf = (pages: ParsedPage[]): string => pages.map((page) => page.text).join('\n')

// 多源提案：ch-1 依据资料 1，ch-2/ch-3 依据资料 2
const multiProposalJson = {
  title: '概率与机器学习合订本',
  description: '跨讲义与笔记组织的学习书',
  rationale: '先概念后公式',
  estimatedMinutes: 45,
  chapters: [
    { title: '第一章', objective: '目标一', coreConcept: '概念一', estimatedMinutes: 15, sourceDoc: 1, pageStart: 1, pageEnd: 2 },
    { title: '第二章', objective: '目标二', coreConcept: '概念二', estimatedMinutes: 15, sourceDoc: 2, pageStart: 1, pageEnd: 1 },
    { title: '第三章', objective: '目标三', coreConcept: '概念三', estimatedMinutes: 15, sourceDoc: 2, pageStart: 2, pageEnd: 2 },
  ],
}

// ch-2（资料 2 第 1 页）章生成输出：citation 引文逐字出自 md 文档第 1 页
const mdChapterJson = {
  blocks: [
    { type: 'explanation', title: '本章讲解', body: '围绕贝叶斯公式展开讲解。', keyPoint: '先验更新为后验' },
    { type: 'citation', title: '原文引文', excerpt: '贝叶斯公式与先验后验概率详解', pageRange: '1' },
    {
      type: 'quiz',
      title: '随堂小测',
      conceptId: 'c1',
      question: '贝叶斯公式更新了什么？',
      options: [
        { id: 'o1', text: '后验概率' },
        { id: 'o2', text: '学习率' },
      ],
      correctAnswerId: 'o1',
      feedback: '贝叶斯公式把先验更新为后验。',
    },
    { type: 'example', title: '本章示例', scenario: '疾病检测中的基础概率。', takeaway: '先验影响结论' },
  ],
}

function upstreamJsonStream(payload: unknown): Response {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const midpoint = Math.floor(text.length / 2)
  const parts = [text.slice(0, midpoint), text.slice(midpoint)]
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function sseEventsFrom(responseText: string): Array<{ event: string; data: any }> {
  return responseText
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split('\n')
      return {
        event: lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '',
        data: JSON.parse(lines.find((line) => line.startsWith('data: '))?.slice(6) ?? 'null'),
      }
    })
}

let dir: string
let documentStore: DocumentStore
let bookStore: BookStore
let pdfId: string
let mdId: string

function appWith(
  fetchImpl: typeof fetch,
  options: { apiKey?: string; logger?: (event: unknown) => void } = {},
) {
  const app = express()
  app.use('/api/books', createBooksRouter({
    documentStore,
    bookStore,
    fetchImpl,
    env: {
      LLM_API_KEY: options.apiKey ?? API_KEY,
      LLM_BASE_URL: 'https://api.deepseek.example/',
      LLM_MODEL: '',
    },
    logger: options.logger ?? vi.fn(),
  }))
  return app
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'books-multi-'))
  documentStore = createDocumentStore(path.join(dir, 'documents'))
  bookStore = createBookStore(path.join(dir, 'books'))
  pdfId = (await documentStore.save({
    fileName: 'lecture.pdf',
    pdf: Buffer.from('%PDF-fake-bytes'),
    parsed: pdfParsed,
  })).id
  mdId = (await documentStore.save({
    fileName: 'notes.md',
    pdf: Buffer.from('# notes'),
    parsed: mdParsed,
    format: 'Markdown',
  })).id
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('POST /api/books multi-source', () => {
  it('creates a dual-source book with segmented digest, real doc anchors and fingerprints', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(multiProposalJson))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentIds: [pdfId, mdId], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(201)
    const { book } = res.body
    expect(book.status).toBe('proposal')
    // 主来源 = sources[0]，保持向后兼容
    expect(book.source.id).toBe(pdfId)
    expect(book.sources).toHaveLength(2)
    expect(book.sources.map((entry: { id: string }) => entry.id)).toEqual([pdfId, mdId])
    expect(book.sources[1]).toMatchObject({ fileName: 'notes.md', format: 'Markdown', pageCount: 2 })

    // 章锚点指向真实 document id，fileName 对应所属资料
    expect(book.chapters[0].sourceAnchors[0]).toMatchObject({ sourceId: pdfId, fileName: 'lecture.pdf', pageRange: '1–2' })
    expect(book.chapters[1].sourceAnchors[0]).toMatchObject({ sourceId: mdId, fileName: 'notes.md', pageRange: '1–1' })
    expect(book.chapters[2].sourceAnchors[0]).toMatchObject({ sourceId: mdId, fileName: 'notes.md', pageRange: '2–2' })

    // 指纹 = 每份资料全文的 sha256
    expect(book.sourceFingerprints).toEqual({
      [pdfId]: fingerprintOf(fullTextOf(pdfParsed.pages)),
      [mdId]: fingerprintOf(fullTextOf(mdParsed.pages)),
    })

    // digest 分段标注资料序号、文件名与页数
    expect(fetchImpl).toHaveBeenCalledOnce()
    const providerBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    const serializedMessages = JSON.stringify(providerBody.messages)
    expect(serializedMessages).toContain('【资料 1：lecture.pdf】（共 2 页）')
    expect(serializedMessages).toContain('【资料 2：notes.md】（共 2 页）')
    expect(serializedMessages).toContain('sourceDoc')

    // 落库可回读，sources/指纹一并持久化
    const saved = await bookStore.get(book.id)
    expect(saved?.sources).toHaveLength(2)
    expect(saved?.sourceFingerprints?.[mdId]).toBe(book.sourceFingerprints[mdId])
  })

  it('accepts a single-entry documentIds array like the legacy documentId', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream({
      ...multiProposalJson,
      chapters: multiProposalJson.chapters.map((chapter) => ({ ...chapter, sourceDoc: 1 })),
    }))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentIds: [pdfId], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(201)
    expect(res.body.book.source.id).toBe(pdfId)
    // 单源书走缺省：不写 sources/指纹字段
    expect(res.body.book.sources).toBeUndefined()
    expect(res.body.book.sourceFingerprints).toBeUndefined()
  })

  it('prefers documentIds when both documentId and documentIds are present', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(multiProposalJson))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentId: 'doc_missing-1', documentIds: [pdfId, mdId], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(201)
    expect(res.body.book.source.id).toBe(pdfId)
    expect(res.body.book.sources).toHaveLength(2)
  })

  it('returns 409 too_many_sources for more than five documents', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentIds: [pdfId, pdfId, pdfId, mdId, mdId, mdId], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'too_many_sources' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 422 sources_too_long when the combined text exceeds 90,000 characters', async () => {
    const bigParsed: ParsedDocument = {
      pageCount: 2,
      pages: [1, 2].map((page) => ({ page, text: '长'.repeat(23_000) })),
    }
    const bigA = (await documentStore.save({ fileName: 'big-a.md', pdf: Buffer.from('a'), parsed: bigParsed, format: 'Markdown' })).id
    const bigB = (await documentStore.save({ fileName: 'big-b.md', pdf: Buffer.from('b'), parsed: bigParsed, format: 'Markdown' })).id
    const fetchImpl = vi.fn<typeof fetch>()

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentIds: [bigA, bigB], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'sources_too_long' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await bookStore.list()).toEqual([])
  })

  it('returns 404 document_not_found when any of the documentIds is missing', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentIds: [pdfId, 'doc_missing-1'], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'document_not_found' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 503 proposal_not_configured for multi-source requests without a key', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const res = await request(appWith(fetchImpl, { apiKey: '' }))
      .post('/api/books')
      .send({ documentIds: [pdfId, mdId], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'proposal_not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('retries once with a correction when the model forges an out-of-range sourceDoc, then succeeds', async () => {
    const forged = {
      ...multiProposalJson,
      chapters: multiProposalJson.chapters.map((chapter) => ({ ...chapter, sourceDoc: 9 })),
    }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(upstreamJsonStream(forged))
      .mockResolvedValueOnce(upstreamJsonStream(multiProposalJson))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentIds: [pdfId, mdId], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(201)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))
    expect(retryBody.messages.at(-1).content).toContain('上次输出未通过校验')
  })

  it('returns 502 proposal_generation_failed when the forged sourceDoc persists across the retry', async () => {
    const forged = {
      ...multiProposalJson,
      chapters: multiProposalJson.chapters.map((chapter) => ({ ...chapter, sourceDoc: 9 })),
    }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockImplementation(async () => upstreamJsonStream(forged))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentIds: [pdfId, mdId], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'proposal_generation_failed' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(await bookStore.list()).toEqual([])
  })

  it('rejects a page range that exceeds its own source document even within the total page count', async () => {
    // 资料 2 只有 2 页，pageEnd 3 不超两份合计 4 页，但越过了所属资料页数
    const overflowing = {
      ...multiProposalJson,
      chapters: multiProposalJson.chapters.map((chapter, index) => (
        index === 2 ? { ...chapter, sourceDoc: 2, pageStart: 2, pageEnd: 3 } : chapter
      )),
    }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockImplementation(async () => upstreamJsonStream(overflowing))

    const res = await request(appWith(fetchImpl))
      .post('/api/books')
      .send({ documentIds: [pdfId, mdId], goal: '理解概念', learnerLevel: '入门' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'proposal_generation_failed' })
  })
})

describe('multi-source chapter generation', () => {
  it('resolves the document by the chapter anchor sourceId so citation checks run against that source', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body))
      if (body.max_completion_tokens === 6000) return upstreamJsonStream(mdChapterJson)
      return upstreamJsonStream(multiProposalJson)
    })
    const app = appWith(fetchImpl)

    const created = await request(app)
      .post('/api/books')
      .send({ documentIds: [pdfId, mdId], goal: '理解概念', learnerLevel: '入门' })
    expect(created.status).toBe(201)
    const bookId = created.body.book.id as string
    const confirmed = await request(app).post(`/api/books/${bookId}/confirm`)
    expect(confirmed.status).toBe(200)

    // ch-2 锚点指向 notes.md；引文子串只在 md 文档内，若错用 pdf 文档校验必败
    const res = await request(app).post(`/api/books/${bookId}/chapters/ch-2/generate`)

    expect(res.status).toBe(200)
    const events = sseEventsFrom(res.text)
    expect(events.at(-1)).toMatchObject({ event: 'chapter_done' })

    const saved = await bookStore.get(bookId)
    const chapter = saved!.chapters.find((entry) => entry.id === 'ch-2')!
    expect(chapter.status).toBe('ready')
    const citationBlock = chapter.blocks.find((block) => block.type === 'citation')!
    expect(citationBlock.sourceAnchors[0].fileName).toBe('notes.md')
  })
})

describe('multi-source export and estimate', () => {
  async function createDualSourceBook(app: express.Express): Promise<string> {
    const created = await request(app)
      .post('/api/books')
      .send({ documentIds: [pdfId, mdId], goal: '理解概念', learnerLevel: '入门' })
    expect(created.status).toBe(201)
    return created.body.book.id as string
  }

  it('lists every source fileName in the exported markdown header', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(multiProposalJson))
    const app = appWith(fetchImpl)
    const bookId = await createDualSourceBook(app)

    const res = await request(app).get(`/api/books/${bookId}/export`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('lecture.pdf')
    expect(res.text).toContain('notes.md')
    expect(res.text).toMatch(/来源：.*lecture\.pdf.*notes\.md/u)
  })

  it('amortizes the estimate over the combined page count of all sources', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamJsonStream(multiProposalJson))
    const app = appWith(fetchImpl)
    const bookId = await createDualSourceBook(app)

    // 把章锚点改成无法解析的页范围，强制走「总页数均摊」回退路径
    const stored = (await bookStore.get(bookId))!
    stored.chapters = stored.chapters.map((chapter) => ({
      ...chapter,
      sourceAnchors: [{ sourceId: pdfId, fileName: 'lecture.pdf', pageRange: '未知', excerpt: '' }],
    }))
    await bookStore.save(stored)

    const res = await request(app).get(`/api/books/${bookId}/estimate`)

    expect(res.status).toBe(200)
    // 两份资料合计 4 页 ÷ 3 章 × 800 + 6000；若只用主来源 2 页会得出更小值
    const expected = Math.round((4 / 3) * 800) + 6000
    expect(res.body.estimate.chapters).toHaveLength(3)
    for (const chapter of res.body.estimate.chapters) {
      expect(chapter.estimatedTokens).toBe(expected)
    }
    expect(res.body.estimate.totalTokens).toBe(expected * 3)
  })
})
