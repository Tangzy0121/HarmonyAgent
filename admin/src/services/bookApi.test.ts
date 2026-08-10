import { afterEach, describe, expect, it, vi } from 'vitest'

import { learningBookFixture } from '../data/learningBook'
import { BookApiError } from '../domain/learningBookApi'
import {
  confirmBook,
  createBook,
  getBook,
  listBooks,
  streamChapterGeneration,
  updateProposal,
  uploadDocument,
  type ChapterGenerationEvent,
} from './bookApi'

const storedBook = {
  ...learningBookFixture,
  createdAt: '2026-08-10T02:00:00.000Z',
  updatedAt: '2026-08-10T02:30:00.000Z',
  generationJobs: [],
}

const documentMeta = {
  id: 'doc_abc-1',
  fileName: '机器学习 · 第三章.pdf',
  sizeBytes: 1024,
  pageCount: 24,
  createdAt: '2026-08-10T02:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function streamResponse(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function encodedChunks(text: string, boundaries: number[] = []): Uint8Array[] {
  const bytes = new TextEncoder().encode(text)
  const points = [0, ...boundaries, bytes.length]
  return points.slice(0, -1).map((start, index) => bytes.slice(start, points[index + 1]))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadDocument', () => {
  it('posts the raw pdf body with the x-file-name header', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], '机器学习 · 第三章.pdf', { type: 'application/pdf' })
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return jsonResponse(documentMeta)
    }))

    const meta = await uploadDocument(file)

    expect(actualUrl).toBe('/api/documents')
    expect(actualInit?.method).toBe('POST')
    const headers = new Headers(actualInit?.headers)
    expect(headers.get('Content-Type')).toBe('application/pdf')
    expect(headers.get('x-file-name')).toBe(encodeURIComponent('机器学习 · 第三章.pdf'))
    expect(actualInit?.body).toBe(file)
    expect(meta).toEqual(documentMeta)
  })

  it('maps a 413 response without a json body to pdf_too_large', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Request Entity Too Large</html>', { status: 413 })))
    const file = new File([new Uint8Array([1])], 'big.pdf', { type: 'application/pdf' })

    const result = uploadDocument(file)

    await expect(result).rejects.toMatchObject({ name: 'BookApiError', code: 'pdf_too_large' })
  })

  it('maps server error codes from json bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'pdf_unreadable', debug: 'stack' }, 422)))
    const file = new File([new Uint8Array([1])], 'broken.pdf', { type: 'application/pdf' })

    const result = uploadDocument(file)

    await expect(result).rejects.toMatchObject({ name: 'BookApiError', code: 'pdf_unreadable' })
    await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('stack'))
  })
})

describe('book collection endpoints', () => {
  it('creates a book and unwraps the { book } envelope through the guard', async () => {
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      actualInit = init
      return jsonResponse({ book: storedBook }, 201)
    }))

    const book = await createBook({ documentId: 'doc_abc-1', goal: '考试复习', learnerLevel: '入门' })

    expect(JSON.parse(String(actualInit?.body))).toEqual({
      documentId: 'doc_abc-1',
      goal: '考试复习',
      learnerLevel: '入门',
    })
    expect(book.id).toBe(storedBook.id)
  })

  it('rejects a create response whose book fails the guard', async () => {
    const broken = { ...storedBook, chapters: 'not-an-array' }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ book: broken }, 201)))

    await expect(createBook({ documentId: 'doc_abc-1', goal: '考试复习', learnerLevel: '入门' }))
      .rejects.toMatchObject({ code: 'invalid_book_payload' })
  })

  it('lists books and keeps server-only fields available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([storedBook])))

    const books = await listBooks()

    expect(books).toHaveLength(1)
    expect(books[0].id).toBe(storedBook.id)
    expect(books[0].createdAt).toBe('2026-08-10T02:00:00.000Z')
    expect(books[0].generationJobs).toEqual([])
  })

  it('reads a single book from the unwrapped get response', async () => {
    let actualUrl: RequestInfo | URL | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      actualUrl = url
      return jsonResponse(storedBook)
    }))

    const book = await getBook('book-1')

    expect(actualUrl).toBe('/api/books/book-1')
    expect(book.id).toBe(storedBook.id)
  })

  it('maps a 404 get to book_not_found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'book_not_found' }, 404)))

    await expect(getBook('missing')).rejects.toMatchObject({ code: 'book_not_found' })
  })

  it('sends proposal edits and maps 409 conflicts', async () => {
    const edits = {
      title: '机器学习第三章 · 复习版',
      chapters: [{ id: 'ch-1', title: '从训练信号理解机器学习', order: 1, objective: '判断', estimatedMinutes: 12 }],
    }
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      actualInit = init
      return jsonResponse({ error: 'book_not_editable' }, 409)
    }))

    const result = updateProposal('book-1', edits)

    await expect(result).rejects.toMatchObject({ code: 'book_not_editable' })
    expect(actualInit?.method).toBe('PUT')
    expect(JSON.parse(String(actualInit?.body))).toEqual(edits)
  })

  it('confirms a book proposal and returns the updated book', async () => {
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    const confirmed = { ...storedBook, status: 'generating' }
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return jsonResponse({ book: confirmed })
    }))

    const book = await confirmBook('book-1')

    expect(actualUrl).toBe('/api/books/book-1/confirm')
    expect(actualInit?.method).toBe('POST')
    expect(book.status).toBe('generating')
  })
})

describe('streamChapterGeneration', () => {
  const explanationBlock = learningBookFixture.chapters[0].blocks.find((block) => block.type === 'explanation')

  it('dispatches chapter_start, block, and chapter_done in order across chunks', async () => {
    const payload = [
      'event: chapter_start\ndata: {"chapterId":"ch-1"}\n\n',
      `event: block\ndata: {"index":0,"block":${JSON.stringify(explanationBlock)}}\n\n`,
      'event: chapter_done\ndata: {"blockCount":1,"warnings":[]}\n\n',
    ].join('')
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return streamResponse(encodedChunks(payload, [7, payload.length - 5]))
    }))
    const events: ChapterGenerationEvent[] = []

    await streamChapterGeneration('book-1', 'ch-1', { onEvent: (event) => events.push(event) })

    expect(actualUrl).toBe('/api/books/book-1/chapters/ch-1/generate')
    expect(actualInit?.method).toBe('POST')
    expect(events).toEqual([
      { type: 'chapter_start', chapterId: 'ch-1' },
      { type: 'block', index: 0, block: explanationBlock },
      { type: 'chapter_done', blockCount: 1, warnings: [] },
    ])
  })

  it('dispatches a provider-safe error event as the terminal event', async () => {
    const payload = 'event: chapter_start\ndata: {"chapterId":"ch-1"}\n\nevent: error\ndata: {"code":"upstream_timeout","message":"章节生成失败，请稍后重试。"}\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(encodedChunks(payload))))
    const events: ChapterGenerationEvent[] = []

    await streamChapterGeneration('book-1', 'ch-1', { onEvent: (event) => events.push(event) })

    expect(events).toEqual([
      { type: 'chapter_start', chapterId: 'ch-1' },
      { type: 'error', code: 'upstream_timeout', message: '章节生成失败，请稍后重试。' },
    ])
  })

  it('preserves AbortError from fetch', async () => {
    const abortError = new DOMException('stopped', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(async () => { throw abortError }))

    await expect(streamChapterGeneration('book-1', 'ch-1', { onEvent: vi.fn() })).rejects.toBe(abortError)
  })

  it('maps pre-stream HTTP 409/404/503 json errors to their codes', async () => {
    const cases: Array<[number, string]> = [
      [409, 'chapter_not_generatable'],
      [404, 'chapter_not_found'],
      [503, 'chapter_not_configured'],
    ]
    for (const [status, code] of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: code }, status)))
      await expect(streamChapterGeneration('book-1', 'ch-1', { onEvent: vi.fn() }))
        .rejects.toMatchObject({ name: 'BookApiError', code })
    }
  })

  it('rejects an unknown block payload and an early eof', async () => {
    const badBlock = 'event: block\ndata: {"index":0,"block":{"type":"video"}}\n\nevent: chapter_done\ndata: {"blockCount":1,"warnings":[]}\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(encodedChunks(badBlock))))
    await expect(streamChapterGeneration('book-1', 'ch-1', { onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: 'invalid_stream' })

    const partial = 'event: chapter_start\ndata: {"chapterId":"ch-1"}\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(encodedChunks(partial))))
    await expect(streamChapterGeneration('book-1', 'ch-1', { onEvent: vi.fn() }))
      .rejects.toMatchObject({ code: 'incomplete_stream' })
  })
})

describe('BookApiError via bookApi', () => {
  it('is the same class thrown by the payload guard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ book: null }, 201)))

    await expect(createBook({ documentId: 'd', goal: '考试复习', learnerLevel: '入门' }))
      .rejects.toBeInstanceOf(BookApiError)
  })
})
