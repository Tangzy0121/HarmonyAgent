import { afterEach, describe, expect, it, vi } from 'vitest'

import { learningBookFixture } from '../data/learningBook'
import { BookApiError } from '../domain/learningBookApi'
import {
  addNote,
  bookExportUrl,
  confirmBook,
  createBook,
  deleteNote,
  getBook,
  getLearnerProfile,
  getPretest,
  getReviewDue,
  listBooks,
  streamChapterGeneration,
  submitAttempt,
  submitFeynman,
  submitFlashReview,
  submitPretest,
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
  format: 'PDF' as const,
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

describe('submitAttempt', () => {
  const attemptResult = {
    attempt: {
      id: 'attempt_9f1c',
      chapterId: 'ch-1',
      blockId: 'blk-quiz-1',
      answerId: 'answer-b',
      isCorrect: true,
      submittedAt: '2026-08-11T01:00:00.000Z',
      diagnosis: {
        type: 'application',
        advice: '先把概念套到一个新例子里，再判断适用条件。',
      },
    },
    evidence: {
      id: 'evidence_9f1c',
      chapterId: 'ch-1',
      conceptId: 'supervised-learning',
      sourceBlockId: 'blk-quiz-1',
      statement: '答对：没有标签的邮件被模型自动分组，这属于监督学习吗？',
      outcome: 'mastered',
      createdAt: '2026-08-11T01:00:00.000Z',
    },
    mastery: { chapter: 0.5, concept: 0.5 },
    schedule: {
      kind: 'quiz',
      stage: 0,
      lapses: 1,
      dueAt: '2026-08-12T01:00:00.000Z',
      updatedAt: '2026-08-11T01:00:00.000Z',
    },
    diagnosis: {
      type: 'application',
      advice: '先把概念套到一个新例子里，再判断适用条件。',
    },
  }

  it('posts blockId/answerId to the attempts endpoint and parses the 201 payload', async () => {
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return jsonResponse(attemptResult, 201)
    }))

    const result = await submitAttempt('book-1', 'blk-quiz-1', 'answer-b')

    expect(actualUrl).toBe('/api/books/book-1/attempts')
    expect(actualInit?.method).toBe('POST')
    expect(JSON.parse(String(actualInit?.body))).toEqual({ blockId: 'blk-quiz-1', answerId: 'answer-b' })
    expect(result).toEqual(attemptResult)
    expect(result.schedule).toMatchObject({ kind: 'quiz', stage: 0 })
    expect(result.diagnosis).toMatchObject({ type: 'application' })
  })

  it('accepts null schedule and diagnosis for a correct answer without review entry', async () => {
    const payload = { ...attemptResult, schedule: null, diagnosis: null }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload, 201)))

    const result = await submitAttempt('book-1', 'blk-quiz-1', 'answer-b')

    expect(result.schedule).toBeNull()
    expect(result.diagnosis).toBeNull()
  })

  it.each([
    ['quiz_not_found'],
    ['invalid_answer'],
  ])('passes through the 409 error code %s', async (code) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: code }, 409)))

    await expect(submitAttempt('book-1', 'blk-quiz-1', 'answer-x'))
      .rejects.toMatchObject({ name: 'BookApiError', code })
  })

  it.each([
    ['missing evidence and mastery', { attempt: attemptResult.attempt, schedule: null, diagnosis: null }],
    ['non-numeric mastery', { ...attemptResult, mastery: { chapter: '0.5', concept: 0.5 } }],
    ['unknown evidence outcome', { ...attemptResult, evidence: { ...attemptResult.evidence, outcome: 'unknown' } }],
    ['missing schedule key', (({ schedule: _schedule, ...rest }) => rest)(attemptResult)],
    ['missing diagnosis key', (({ diagnosis: _diagnosis, ...rest }) => rest)(attemptResult)],
    ['unknown schedule kind', { ...attemptResult, schedule: { ...attemptResult.schedule, kind: 'video' } }],
    ['unknown diagnosis type', { ...attemptResult, diagnosis: { ...attemptResult.diagnosis, type: 'guessing' } }],
    ['empty diagnosis advice', { ...attemptResult, diagnosis: { ...attemptResult.diagnosis, advice: '' } }],
    ['invalid attempt diagnosis', { ...attemptResult, attempt: { ...attemptResult.attempt, diagnosis: { type: 'typo', advice: 'x' } } }],
  ])('rejects a malformed 201 payload (%s)', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload, 201)))

    await expect(submitAttempt('book-1', 'blk-quiz-1', 'answer-b'))
      .rejects.toMatchObject({ name: 'BookApiError', code: 'invalid_attempt_payload' })
  })
})

describe('review endpoints', () => {
  const dueItem = {
    blockId: 'blk-f1',
    chapterId: 'ch-1',
    kind: 'flash_cards',
    title: '核心闪卡',
    dueAt: '2026-08-11T06:00:00.000Z',
    stage: 1,
    lapses: 0,
  }
  const scheduleEntry = {
    kind: 'flash_cards',
    stage: 2,
    lapses: 0,
    dueAt: '2026-08-14T06:00:00.000Z',
    updatedAt: '2026-08-11T06:00:00.000Z',
  }

  it('getReviewDue reads the due list and returns the items array', async () => {
    let actualUrl: RequestInfo | URL | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      actualUrl = url
      return jsonResponse({ items: [dueItem] })
    }))

    const items = await getReviewDue('book_1')

    expect(actualUrl).toBe('/api/books/book_1/review/due')
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual(dueItem)
  })

  it.each([
    ['items is not an array', { items: 'nope' }],
    ['missing items key', {}],
    ['item with unknown kind', { items: [{ ...dueItem, kind: 'video' }] }],
    ['item missing dueAt', { items: [((({ dueAt: _dueAt, ...rest }) => rest)(dueItem))] }],
  ])('getReviewDue rejects a malformed payload (%s)', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload)))

    await expect(getReviewDue('book_1'))
      .rejects.toMatchObject({ name: 'BookApiError', code: 'invalid_review_due_payload' })
  })

  it('submitFlashReview posts the result and parses a graduated null schedule', async () => {
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return jsonResponse({ schedule: null })
    }))

    await expect(submitFlashReview('book_1', 'blk-f1', 'remembered')).resolves.toBeNull()
    expect(actualUrl).toBe('/api/books/book_1/review/blk-f1/result')
    expect(actualInit?.method).toBe('POST')
    expect(JSON.parse(String(actualInit?.body))).toEqual({ result: 'remembered' })
  })

  it('submitFlashReview parses an updated schedule entry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schedule: scheduleEntry })))

    const result = await submitFlashReview('book_1', 'blk-f1', 'forgotten')

    expect(result).toEqual(scheduleEntry)
  })

  it.each([
    ['missing schedule key', {}],
    ['schedule with unknown kind', { schedule: { ...scheduleEntry, kind: 'video' } }],
    ['schedule missing stage', { schedule: (({ stage: _stage, ...rest }) => rest)(scheduleEntry) }],
  ])('submitFlashReview rejects a malformed payload (%s)', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload)))

    await expect(submitFlashReview('book_1', 'blk-f1', 'remembered'))
      .rejects.toMatchObject({ name: 'BookApiError', code: 'invalid_review_result_payload' })
  })
})

describe('pretest endpoints', () => {
  const pretestQuestions = [
    {
      id: 'pq-1',
      chapterId: 'ch-1',
      question: '监督学习需要什么信号？',
      options: [
        { id: 'pq-1-a', marker: 'A', text: '目标标签' },
        { id: 'pq-1-b', marker: 'B', text: '更多数据' },
      ],
      correctAnswerId: 'pq-1-a',
      explanation: '监督学习依赖目标标签。',
    },
    {
      id: 'pq-2',
      chapterId: 'ch-2',
      question: '损失函数的作用是什么？',
      options: [
        { id: 'pq-2-a', marker: 'A', text: '衡量误差' },
        { id: 'pq-2-b', marker: 'B', text: '增加参数' },
      ],
      correctAnswerId: 'pq-2-a',
      explanation: '损失衡量预测与目标的差距。',
    },
  ]
  const pretestResult = {
    answers: { 'pq-1': 'pq-1-a', 'pq-2': 'pq-2-b' },
    suggestedStartChapterId: 'ch-2',
    skippableChapterIds: ['ch-1'],
    submittedAt: '2026-08-11T03:00:00.000Z',
  }

  it('getPretest posts to the pretest endpoint and parses the bare payload', async () => {
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return jsonResponse({ questions: pretestQuestions, result: null })
    }))

    const pretest = await getPretest('book-1')

    expect(actualUrl).toBe('/api/books/book-1/pretest')
    expect(actualInit?.method).toBe('POST')
    expect(pretest).toEqual({ questions: pretestQuestions, result: null })
  })

  it('getPretest returns an existing result when the server responds idempotently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ questions: pretestQuestions, result: pretestResult })))

    const pretest = await getPretest('book-1')

    expect(pretest.result).toEqual(pretestResult)
  })

  it('getPretest passes through 409 pretest_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'pretest_unavailable' }, 409)))

    await expect(getPretest('book-1')).rejects.toMatchObject({ name: 'BookApiError', code: 'pretest_unavailable' })
  })

  it.each([
    ['questions is not an array', { questions: 'nope', result: null }],
    ['option misses marker', { questions: [{ ...pretestQuestions[0], options: [{ id: 'pq-1-a', text: '目标标签' }] }], result: null }],
    ['result misses skippableChapterIds', { questions: pretestQuestions, result: { answers: {}, suggestedStartChapterId: 'ch-2', submittedAt: '2026-08-11T03:00:00.000Z' } }],
  ])('getPretest rejects a malformed payload (%s)', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload)))

    await expect(getPretest('book-1')).rejects.toMatchObject({ name: 'BookApiError', code: 'invalid_pretest_payload' })
  })

  it('submitPretest posts answers and parses the { book } envelope with the pretest result', async () => {
    const resolvedBook = { ...storedBook, pretest: { questions: pretestQuestions, result: pretestResult } }
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return jsonResponse({ book: resolvedBook })
    }))

    const book = await submitPretest('book-1', pretestResult.answers)

    expect(actualUrl).toBe('/api/books/book-1/pretest/result')
    expect(actualInit?.method).toBe('POST')
    expect(JSON.parse(String(actualInit?.body))).toEqual({ answers: pretestResult.answers })
    expect(book.pretest?.result).toEqual(pretestResult)
  })

  it('submitPretest passes through 409 pretest_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'pretest_unavailable' }, 409)))

    await expect(submitPretest('book-1', {})).rejects.toMatchObject({ name: 'BookApiError', code: 'pretest_unavailable' })
  })

  it('submitPretest rejects when the returned book fails the guard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ book: { ...storedBook, chapters: 'not-an-array' } })))

    await expect(submitPretest('book-1', {})).rejects.toMatchObject({ name: 'BookApiError', code: 'invalid_book_payload' })
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

describe('submitFeynman', () => {
  const feynmanResult = {
    passed: false,
    feedback: '讲到了找规律，但还不够完整。',
    gap: '缺少「用规律做预测」这一环。',
  }

  it('posts explanation to the chapter feynman endpoint and parses the 200 payload', async () => {
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return jsonResponse(feynmanResult, 200)
    }))

    const result = await submitFeynman('book-1', 'ch-1', '机器学习是从数据找规律。')

    expect(actualUrl).toBe('/api/books/book-1/chapters/ch-1/feynman')
    expect(actualInit?.method).toBe('POST')
    expect(JSON.parse(String(actualInit?.body))).toEqual({ explanation: '机器学习是从数据找规律。' })
    expect(result).toEqual(feynmanResult)
  })

  it.each([
    ['chapter_not_generatable'],
    ['feynman_not_configured'],
    ['upstream_unavailable'],
  ])('passes through the error code %s', async (code) => {
    const status = code === 'feynman_not_configured' ? 503 : code === 'upstream_unavailable' ? 502 : 409
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: code }, status)))

    await expect(submitFeynman('book-1', 'ch-1', '复述'))
      .rejects.toMatchObject({ name: 'BookApiError', code })
  })

  it.each([
    ['non-boolean passed', { ...feynmanResult, passed: '对' }],
    ['missing feedback', { passed: true, gap: '' }],
    ['missing gap', { passed: true, feedback: '好。' }],
  ])('rejects a malformed 200 payload (%s)', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload, 200)))

    await expect(submitFeynman('book-1', 'ch-1', '复述'))
      .rejects.toMatchObject({ name: 'BookApiError', code: 'invalid_feynman_payload' })
  })
})

describe('BookApiError via bookApi', () => {
  it('is the same class thrown by the payload guard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ book: null }, 201)))

    await expect(createBook({ documentId: 'd', goal: '考试复习', learnerLevel: '入门' }))
      .rejects.toBeInstanceOf(BookApiError)
  })
})

describe('note endpoints', () => {
  const note = {
    id: 'note_1',
    chapterId: 'ch-1',
    blockId: 'blk-1',
    body: '这个例子可以类比成教小孩认猫。',
    createdAt: '2026-08-17T02:00:00.000Z',
  }

  it('addNote posts the note and parses the response', async () => {
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return jsonResponse({ note }, 201)
    }))

    const created = await addNote('book_1', 'ch-1', 'blk-1', note.body)

    expect(actualUrl).toBe('/api/books/book_1/notes')
    expect(actualInit?.method).toBe('POST')
    expect(JSON.parse(String(actualInit?.body))).toEqual({ chapterId: 'ch-1', blockId: 'blk-1', body: note.body })
    expect(created).toEqual(note)
  })

  it.each([
    ['note missing id', { note: { ...note, id: 1 } }],
    ['missing note key', {}],
  ])('addNote rejects a malformed payload (%s)', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload, 201)))

    await expect(addNote('book_1', 'ch-1', 'blk-1', '笔记'))
      .rejects.toMatchObject({ name: 'BookApiError', code: 'invalid_note_payload' })
  })

  it('addNote surfaces server error codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'block_not_found' }, 409)))

    await expect(addNote('book_1', 'ch-1', 'blk-x', '笔记'))
      .rejects.toMatchObject({ name: 'BookApiError', code: 'block_not_found' })
  })

  it('deleteNote issues DELETE and resolves on 204', async () => {
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return new Response(null, { status: 204 })
    }))

    await expect(deleteNote('book_1', 'note_1')).resolves.toBeUndefined()
    expect(actualUrl).toBe('/api/books/book_1/notes/note_1')
    expect(actualInit?.method).toBe('DELETE')
  })

  it('deleteNote surfaces server error codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'note_not_found' }, 404)))

    await expect(deleteNote('book_1', 'note_x'))
      .rejects.toMatchObject({ name: 'BookApiError', code: 'note_not_found' })
  })
})

describe('bookExportUrl', () => {
  it('builds an encoded export URL', () => {
    expect(bookExportUrl('book_a/b')).toBe('/api/books/book_a%2Fb/export')
  })
})

describe('getLearnerProfile', () => {
  const profile = {
    concepts: [{
      label: '监督学习',
      displayLabel: '监督学习',
      mastery: 0.5,
      attempts: 2,
      lastOutcome: 'review',
      lastAttemptAt: '2026-08-12T10:00:00.000Z',
      sources: [{ bookId: 'book_1', chapterId: 'ch-1', conceptId: 'c-1' }],
      forgettingCliff: false,
    }],
    rhythm: {
      activeDays30: 4,
      streakDays: 3,
      periodDistribution: { morning: 0.5, afternoon: 0.5, evening: 0, night: 0 },
      dailyAverageEvents: 0.13,
      studiedToday: true,
    },
    derivedAt: '2026-08-17T08:00:00.000Z',
  }

  it('reads and parses the learner profile', async () => {
    let actualUrl: RequestInfo | URL | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      actualUrl = url
      return jsonResponse(profile)
    }))

    const result = await getLearnerProfile()

    expect(actualUrl).toBe('/api/learner/profile')
    expect(result).toEqual(profile)
  })

  it.each([
    ['concepts not array', { ...profile, concepts: 'nope' }],
    ['concept missing sources', { ...profile, concepts: [{ ...profile.concepts[0], sources: 1 }] }],
    ['missing rhythm', (({ rhythm: _rhythm, ...rest }) => rest)(profile)],
  ])('rejects a malformed payload (%s)', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload)))

    await expect(getLearnerProfile())
      .rejects.toMatchObject({ name: 'BookApiError', code: 'invalid_learner_profile_payload' })
  })
})
