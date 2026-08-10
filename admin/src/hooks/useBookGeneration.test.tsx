import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BookApiError } from '../domain/learningBookApi'
import { streamChapterGeneration, type StreamChapterGenerationOptions } from '../services/bookApi'
import type { BookBlock } from '../types/learningBook'
import {
  useBookGeneration,
  type BookGenerationEvent,
  type UseBookGenerationResult,
} from './useBookGeneration'

vi.mock('../services/bookApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bookApi')>()
  return { ...actual, streamChapterGeneration: vi.fn() }
})

class FakeElement {
  nodeType = 1
  nodeName: string
  tagName: string
  namespaceURI = 'http://www.w3.org/1999/xhtml'
  ownerDocument: FakeDocument
  parentNode: FakeElement | null = null
  childNodes: FakeElement[] = []

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase()
    this.nodeName = this.tagName
    this.ownerDocument = ownerDocument
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  insertBefore(child: FakeElement, before: FakeElement | null): FakeElement {
    child.parentNode = this
    const index = before ? this.childNodes.indexOf(before) : -1
    if (index < 0) this.childNodes.push(child)
    else this.childNodes.splice(index, 0, child)
    return child
  }

  removeChild(child: FakeElement): FakeElement {
    this.childNodes = this.childNodes.filter((candidate) => candidate !== child)
    child.parentNode = null
    return child
  }

  get firstChild(): FakeElement | null {
    return this.childNodes[0] ?? null
  }

  get lastChild(): FakeElement | null {
    return this.childNodes[this.childNodes.length - 1] ?? null
  }
}

class FakeDocument {
  nodeType = 9
  nodeName = '#document'
  defaultView: Record<string, unknown>
  documentElement: FakeElement
  body: FakeElement
  activeElement: FakeElement

  constructor() {
    this.defaultView = {}
    this.documentElement = new FakeElement('html', this)
    this.body = new FakeElement('body', this)
    this.activeElement = this.body
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  createElement(tagName: string): FakeElement { return new FakeElement(tagName, this) }
  createElementNS(_namespace: string, tagName: string): FakeElement { return this.createElement(tagName) }
}

interface PendingStream {
  bookId: string
  chapterId: string
  options: StreamChapterGenerationOptions
  resolve: () => void
  reject: (error: unknown) => void
}

const chapterIds = ['ch-1', 'ch-2', 'ch-3']

let streams: PendingStream[]
let documentStub: FakeDocument
let container: FakeElement
let root: Root
let latest: UseBookGenerationResult
let events: BookGenerationEvent[]

function explanationBlock(id: string): BookBlock {
  return {
    id,
    type: 'explanation',
    status: 'ready',
    title: `块 ${id}`,
    revision: 1,
    sourceAnchors: [{ sourceId: 'doc-1', fileName: 'chapter.pdf', pageRange: '1-2', excerpt: '摘录' }],
    body: '正文',
    keyPoint: '要点',
  }
}

function Harness({ bookId, chapters }: { bookId: string | null; chapters: Array<{ id: string; status: string }> }) {
  latest = useBookGeneration({
    bookId,
    chapters: chapters as Array<{ id: string; status: 'pending' | 'generating' | 'ready' | 'partial' | 'error' }>,
    onEvent: (event) => { events.push(event) },
  })
  return null
}

function render(bookId: string | null, chapters: Array<{ id: string; status: string }>): void {
  flushSync(() => root.render(<Harness bookId={bookId} chapters={chapters} />))
}

function start(): void {
  flushSync(() => latest.start())
}

async function flushEffects(): Promise<void> {
  // React 18 在事件外触发的更新经 Scheduler 宏任务（MessageChannel）调度，微任务等不到
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  flushSync(() => undefined)
}

async function finishStream(stream: PendingStream, emitted: Array<{ type: string; [key: string]: unknown }>): Promise<void> {
  for (const event of emitted) {
    flushSync(() => stream.options.onEvent(event as never))
  }
  stream.resolve()
  await flushEffects()
}

beforeEach(() => {
  streams = []
  events = []
  documentStub = new FakeDocument()
  const windowStub = {
    document: documentStub,
    HTMLIFrameElement: class {},
    HTMLElement: FakeElement,
    Node: FakeElement,
    Element: FakeElement,
  }
  documentStub.defaultView = windowStub
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('HTMLElement', FakeElement)
  vi.stubGlobal('Node', FakeElement)
  vi.mocked(streamChapterGeneration).mockImplementation((bookId, chapterId, options) => new Promise<void>((resolve, reject) => {
    streams.push({ bookId, chapterId, options, resolve, reject })
    options.signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true })
  }))
  container = new FakeElement('div', documentStub)
  root = createRoot(container as unknown as Element)
  render('book_x', chapterIds.map((id) => ({ id, status: 'pending' })))
})

afterEach(async () => {
  flushSync(() => root.unmount())
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('useBookGeneration', () => {
  it('generates pending chapters sequentially, one stream at a time', async () => {
    start()
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1'])
    expect(latest.progress).toEqual({ chapterId: 'ch-1', blocksReceived: 0 })

    await finishStream(streams[0], [
      { type: 'chapter_start', chapterId: 'ch-1' },
      { type: 'block', index: 0, block: explanationBlock('blk-1') },
      { type: 'block', index: 1, block: explanationBlock('blk-2') },
      { type: 'chapter_done', blockCount: 2, warnings: [] },
    ])

    expect(events.map((event) => event.type)).toEqual(['chapter_start', 'block', 'block', 'chapter_done'])
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1', 'ch-2'])

    await finishStream(streams[1], [
      { type: 'chapter_start', chapterId: 'ch-2' },
      { type: 'chapter_done', blockCount: 0, warnings: [] },
    ])
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1', 'ch-2', 'ch-3'])

    await finishStream(streams[2], [
      { type: 'chapter_start', chapterId: 'ch-3' },
      { type: 'chapter_done', blockCount: 0, warnings: [] },
    ])
    expect(latest.progress).toBeNull()
  })

  it('tracks blocksReceived progress from block events', async () => {
    start()
    flushSync(() => streams[0].options.onEvent({ type: 'chapter_start', chapterId: 'ch-1' }))
    expect(latest.progress).toEqual({ chapterId: 'ch-1', blocksReceived: 0 })
    flushSync(() => streams[0].options.onEvent({ type: 'block', index: 0, block: explanationBlock('blk-1') }))
    flushSync(() => streams[0].options.onEvent({ type: 'block', index: 1, block: explanationBlock('blk-2') }))
    expect(latest.progress).toEqual({ chapterId: 'ch-1', blocksReceived: 2 })
  })

  it('records a chapter error and continues with the next chapter', async () => {
    start()
    await finishStream(streams[0], [
      { type: 'chapter_start', chapterId: 'ch-1' },
      { type: 'error', code: 'upstream_unavailable', message: '生成失败' },
    ])

    expect(events.map((event) => event.type)).toEqual(['chapter_start', 'chapter_error'])
    expect(events[1]).toMatchObject({ type: 'chapter_error', chapterId: 'ch-1' })
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1', 'ch-2'])
  })

  it('records a thrown BookApiError as a chapter error and continues', async () => {
    start()
    streams[0].reject(new BookApiError('chapter_not_configured', '生成服务未配置'))
    await flushEffects()

    expect(events.some((event) => event.type === 'chapter_error' && event.chapterId === 'ch-1')).toBe(true)
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1', 'ch-2'])
  })

  it('retryChapter restarts a single errored chapter', async () => {
    start()
    await finishStream(streams[0], [
      { type: 'chapter_start', chapterId: 'ch-1' },
      { type: 'error', code: 'upstream_unavailable', message: '生成失败' },
    ])
    await finishStream(streams[1], [
      { type: 'chapter_start', chapterId: 'ch-2' },
      { type: 'chapter_done', blockCount: 0, warnings: [] },
    ])
    await finishStream(streams[2], [
      { type: 'chapter_start', chapterId: 'ch-3' },
      { type: 'chapter_done', blockCount: 0, warnings: [] },
    ])
    expect(latest.progress).toBeNull()

    flushSync(() => latest.retryChapter('ch-1'))
    expect(streams).toHaveLength(4)
    expect(streams[3].chapterId).toBe('ch-1')
    expect(latest.progress).toEqual({ chapterId: 'ch-1', blocksReceived: 0 })
  })

  it('aborts the in-flight stream when bookId turns null and reports nothing further', async () => {
    start()
    flushSync(() => streams[0].options.onEvent({ type: 'chapter_start', chapterId: 'ch-1' }))
    const inFlight = streams[0]

    render(null, chapterIds.map((id) => ({ id, status: 'pending' })))
    await flushEffects()

    expect(inFlight.options.signal?.aborted).toBe(true)
    expect(latest.progress).toBeNull()
    expect(events.map((event) => event.type)).toEqual(['chapter_start'])
  })

  it('aborts the in-flight stream on unmount', async () => {
    start()
    const inFlight = streams[0]
    flushSync(() => root.unmount())
    expect(inFlight.options.signal?.aborted).toBe(true)
    // remount so afterEach cleanup has a live root
    root = createRoot(container as unknown as Element)
    render('book_x', chapterIds.map((id) => ({ id, status: 'pending' })))
  })

  it('is inert while bookId is null', () => {
    render(null, chapterIds.map((id) => ({ id, status: 'pending' })))
    start()
    expect(streams).toHaveLength(0)
    expect(latest.progress).toBeNull()
  })

  it('skips chapters that are already ready when starting', async () => {
    render('book_x', [
      { id: 'ch-1', status: 'ready' },
      { id: 'ch-2', status: 'pending' },
      { id: 'ch-3', status: 'pending' },
    ])
    start()
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-2'])
  })
})
