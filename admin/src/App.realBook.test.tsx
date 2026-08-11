import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { learningBookFixture } from './data/learningBook'
import { BookApiError } from './domain/learningBookApi'
import {
  confirmBook,
  createBook,
  getBook,
  getPretest,
  listBooks,
  streamChapterGeneration,
  submitAttempt,
  submitPretest,
  updateProposal,
  uploadDocument,
  type StoredBook,
  type StreamChapterGenerationOptions,
} from './services/bookApi'

vi.mock('./services/bookApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/bookApi')>()
  return {
    ...actual,
    uploadDocument: vi.fn(),
    listBooks: vi.fn(),
    createBook: vi.fn(),
    getBook: vi.fn(),
    updateProposal: vi.fn(),
    confirmBook: vi.fn(),
    streamChapterGeneration: vi.fn(),
    submitAttempt: vi.fn(),
    getPretest: vi.fn(),
    submitPretest: vi.fn(),
  }
})

class FakeText {
  nodeType = 3
  nodeName = '#text'
  parentNode: FakeElement | null = null

  constructor(public nodeValue: string, public ownerDocument: FakeDocument) {}

  get textContent() { return this.nodeValue }
  set textContent(value: string) { this.nodeValue = value }
}

class FakeElement {
  nodeType = 1
  nodeName: string
  tagName: string
  namespaceURI = 'http://www.w3.org/1999/xhtml'
  parentNode: FakeElement | null = null
  childNodes: Array<FakeElement | FakeText> = []
  attributes = new Map<string, string>()
  files: File[] | undefined
  style: Record<string, string> & { setProperty: (name: string, value: string) => void }

  constructor(tagName: string, public ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase()
    this.nodeName = this.tagName
    const style = Object.create(null) as FakeElement['style']
    style.setProperty = (name: string, value: string) => { style[name] = value }
    this.style = style
  }

  // React 的 change 事件插件按 type 属性识别 file input
  get type() { return this.getAttribute('type') ?? '' }

  addEventListener(): void {}
  removeEventListener(): void {}
  setAttribute(name: string, value: string): void { this.attributes.set(name, value) }
  removeAttribute(name: string): void { this.attributes.delete(name) }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  focus(): void { this.ownerDocument.activeElement = this }
  closest(selector: string): FakeElement | null { return selector === 'button' && this.tagName === 'BUTTON' ? this : this.parentNode?.closest(selector) ?? null }
  scrollIntoView(): void {}
  // LociGlass 的 rAF 回调会读尺寸；零尺寸让其提前返回，避免测试期未处理异常
  getBoundingClientRect() {
    return { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }
  }

  appendChild(child: FakeElement | FakeText) {
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  insertBefore(child: FakeElement | FakeText, before: FakeElement | FakeText | null) {
    child.parentNode = this
    const index = before ? this.childNodes.indexOf(before) : -1
    if (index < 0) this.childNodes.push(child)
    else this.childNodes.splice(index, 0, child)
    return child
  }

  removeChild(child: FakeElement | FakeText) {
    this.childNodes = this.childNodes.filter((candidate) => candidate !== child)
    child.parentNode = null
    return child
  }

  get firstChild() { return this.childNodes[0] ?? null }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null }
  get className() { return this.getAttribute('class') ?? '' }
  set className(value: string) { this.setAttribute('class', value) }
  get textContent(): string { return this.childNodes.map((child) => child.textContent).join('') }
  set textContent(value: string) {
    this.childNodes = value ? [new FakeText(value, this.ownerDocument)] : []
    if (this.childNodes[0]) this.childNodes[0].parentNode = this
  }
}

class FakeDocument {
  nodeType = 9
  nodeName = '#document'
  documentElement = new FakeElement('html', this)
  body = new FakeElement('body', this)
  activeElement: FakeElement = this.body
  defaultView: Record<string, unknown> = {}
  title = ''

  addEventListener(): void {}
  removeEventListener(): void {}
  createElement(tagName: string) { return new FakeElement(tagName, this) }
  createElementNS(namespace: string, tagName: string) {
    const element = this.createElement(tagName)
    element.namespaceURI = namespace
    return element
  }
  createTextNode(value: string) { return new FakeText(value, this) }
  getElementById(): null { return null }
}

interface FakeHistoryEntry {
  state: Record<string, unknown> | null
  hash: string
}

interface FakeWindow {
  document: FakeDocument
  location: { readonly hash: string; readonly href: string }
  history: {
    readonly state: Record<string, unknown> | null
    pushState: (state: Record<string, unknown> | null, title: string, url: string) => void
    replaceState: (state: Record<string, unknown> | null, title: string, url: string) => void
    back: () => void
    go: (delta: number) => void
  }
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
  navigate: (hash: string) => void
  [key: string]: unknown
}

interface PendingStream {
  bookId: string
  chapterId: string
  options: StreamChapterGenerationOptions
  resolve: () => void
  reject: (error: unknown) => void
}

function normalizeHash(url: string): string {
  if (!url.includes('#')) return url.startsWith('http') ? '' : url
  return `#${url.split('#')[1]}`
}

function createFakeWindow(initialHash: string): FakeWindow {
  const documentStub = new FakeDocument()
  let hash = initialHash
  const stack: FakeHistoryEntry[] = [{ state: null, hash: initialHash }]
  let index = 0
  const listeners = new Map<string, Set<() => void>>()
  const applyHash = (url: string) => { hash = normalizeHash(url) }
  const firePopstate = () => {
    flushSync(() => {
      for (const listener of listeners.get('popstate') ?? []) listener()
    })
  }
  const windowStub: FakeWindow = {
    document: documentStub,
    location: {
      get hash() { return hash },
      get href() { return `http://loci.test/${hash}` },
    },
    history: {
      get state() { return stack[index].state },
      pushState(state, _title, url) {
        stack.length = index + 1
        stack.push({ state, hash: normalizeHash(url) })
        index += 1
        applyHash(url)
      },
      replaceState(state, _title, url) {
        stack[index] = { state, hash: normalizeHash(url) }
        applyHash(url)
      },
      back() {
        if (index <= 0) return
        index -= 1
        applyHash(stack[index].hash)
        firePopstate()
      },
      go(delta) {
        const next = index + delta
        if (next < 0 || next >= stack.length) return
        index = next
        applyHash(stack[index].hash)
        firePopstate()
      },
    },
    innerHeight: 844,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
    addEventListener(type, listener) {
      const bucket = listeners.get(type) ?? new Set()
      bucket.add(listener)
      listeners.set(type, bucket)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    navigate(nextHash: string) {
      hash = nextHash
      firePopstate()
    },
    HTMLIFrameElement: class {},
    HTMLElement: FakeElement,
    Element: FakeElement,
    Node: FakeElement,
  }
  documentStub.defaultView = windowStub
  return windowStub
}

function realBookFixture(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    ...learningBookFixture,
    id: 'book_x',
    status: 'proposal',
    activeChapterId: 'ch-1',
    chapters: learningBookFixture.chapters.map((chapter) => ({ ...chapter, status: 'pending' as const, blocks: [] })),
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-10T02:00:00.000Z',
    updatedAt: '2026-08-10T02:00:00.000Z',
    generationJobs: [],
    ...overrides,
  }
}

const proposalBook = realBookFixture()

// 摸底 fixture：五题覆盖四章，结论为跳过 ch-1、建议从 ch-2 开始
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
      { id: 'pq-2-a', marker: 'A', text: '衡量预测误差' },
      { id: 'pq-2-b', marker: 'B', text: '增加参数数量' },
    ],
    correctAnswerId: 'pq-2-a',
    explanation: '损失衡量预测与目标的差距。',
  },
  {
    id: 'pq-3',
    chapterId: 'ch-3',
    question: '聚类属于哪一类学习任务？',
    options: [
      { id: 'pq-3-a', marker: 'A', text: '无监督学习' },
      { id: 'pq-3-b', marker: 'B', text: '监督学习' },
    ],
    correctAnswerId: 'pq-3-a',
    explanation: '聚类没有目标标签。',
  },
  {
    id: 'pq-4',
    chapterId: 'ch-4',
    question: '验证集用来做什么？',
    options: [
      { id: 'pq-4-a', marker: 'A', text: '评估泛化能力' },
      { id: 'pq-4-b', marker: 'B', text: '直接训练参数' },
    ],
    correctAnswerId: 'pq-4-a',
    explanation: '验证集评估泛化。',
  },
  {
    id: 'pq-5',
    chapterId: 'ch-1',
    question: '垃圾邮件过滤是有监督任务吗？',
    options: [
      { id: 'pq-5-a', marker: 'A', text: '是，有标签分类' },
      { id: 'pq-5-b', marker: 'B', text: '否，没有标签' },
    ],
    correctAnswerId: 'pq-5-a',
    explanation: '垃圾邮件过滤是有标签的分类任务。',
  },
]

const pretestResultPayload = {
  answers: {
    'pq-1': 'pq-1-a',
    'pq-2': 'pq-2-a',
    'pq-3': 'pq-3-a',
    'pq-4': 'pq-4-a',
    'pq-5': 'pq-5-a',
  },
  suggestedStartChapterId: 'ch-2',
  skippableChapterIds: ['ch-1'],
  submittedAt: '2026-08-11T03:00:00.000Z',
}
const documentMeta = {
  id: 'doc-1',
  fileName: '机器学习 · 第三章.pdf',
  sizeBytes: 1024,
  pageCount: 24,
  createdAt: '2026-08-10T02:00:00.000Z',
}

let windowStub: FakeWindow
let container: FakeElement
let root: Root | undefined
let streams: PendingStream[]

async function flushEffects(): Promise<void> {
  // React 18 在事件外触发的更新经 Scheduler 宏任务（MessageChannel）调度，微任务等不到
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  flushSync(() => undefined)
}

function mountApp(initialHash: string): void {
  windowStub = createFakeWindow(initialHash)
  vi.stubGlobal('document', windowStub.document)
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('Element', FakeElement)
  vi.stubGlobal('HTMLElement', FakeElement)
  vi.stubGlobal('Node', FakeElement)
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
  container = new FakeElement('div', windowStub.document)
  root = createRoot(container as unknown as Element)
  streams = []
  flushSync(() => root?.render(<App />))
}

function descendants(element: FakeElement): FakeElement[] {
  return element.childNodes.flatMap((child) => child instanceof FakeElement ? [child, ...descendants(child)] : [])
}

function findButton(text: string): FakeElement {
  const button = descendants(container).find((element) => (
    element.tagName === 'BUTTON' && element.textContent.includes(text)
  ))
  expect(button, `button containing "${text}"`).toBeDefined()
  return button as FakeElement
}

function click(text: string): void {
  flushSync(() => Simulate.click(findButton(text) as unknown as Element))
}

function clickWithin(rootElement: FakeElement, text: string): void {
  const button = descendants(rootElement).find((element) => element.tagName === 'BUTTON' && element.textContent.includes(text))
  expect(button, `button containing "${text}" inside block`).toBeDefined()
  flushSync(() => Simulate.click(button as unknown as Element))
}

function clickAriaLabel(label: string): void {
  const button = descendants(container).find((element) => element.tagName === 'BUTTON' && element.getAttribute('aria-label') === label)
  expect(button, `button with aria-label "${label}"`).toBeDefined()
  flushSync(() => Simulate.click(button as unknown as Element))
}

function selectFile(file: File): void {
  const input = descendants(container).find((element) => element.tagName === 'INPUT' && element.getAttribute('type') === 'file')
  expect(input, 'file input').toBeDefined()
  ;(input as FakeElement).files = [file]
  flushSync(() => Simulate.change(input as unknown as Element, {}))
}

function emitStream(stream: PendingStream, events: Array<Record<string, unknown>>): void {
  for (const event of events) {
    flushSync(() => stream.options.onEvent(event as never))
  }
}

beforeEach(() => {
  vi.mocked(listBooks).mockResolvedValue([])
  vi.mocked(getBook).mockImplementation(async (id) => {
    if (id === 'book_x') return proposalBook
    if (id === 'book_new') return realBookFixture({ id: 'book_new' })
    throw new BookApiError('book_not_found', '学习资料服务暂时不可用，请稍后重试。')
  })
  vi.mocked(updateProposal).mockImplementation(async () => proposalBook)
  vi.mocked(confirmBook).mockImplementation(async () => ({ ...proposalBook, status: 'generating' as const }))
  vi.mocked(uploadDocument).mockResolvedValue(documentMeta)
  vi.mocked(createBook).mockImplementation(async () => realBookFixture({ id: 'book_new' }))
  vi.mocked(streamChapterGeneration).mockImplementation((bookId, chapterId, options) => new Promise<void>((resolve, reject) => {
    streams.push({ bookId, chapterId, options, resolve, reject })
    options.signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true })
  }))
  vi.mocked(getPretest).mockResolvedValue({ questions: pretestQuestions, result: null })
  vi.mocked(submitPretest).mockImplementation(async () => realBookFixture({
    status: 'generating',
    pretest: { questions: pretestQuestions, result: pretestResultPayload },
  }))
})

afterEach(async () => {
  if (root) flushSync(() => root?.unmount())
  root = undefined
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('App · 真实学习书接线', () => {
  it('以 #proposal/{bookId} 挂载时经 getBook 载入并显示提案页', async () => {
    mountApp('#proposal/book_x')
    await flushEffects()

    expect(getBook).toHaveBeenCalledWith('book_x')
    expect(container.textContent).toContain('互动学习书提案')
    expect(container.textContent).toContain('确认目录并生成')
    expect(streamChapterGeneration).not.toHaveBeenCalled()
  })

  it('确认目录后调用 updateProposal + confirmBook，跳到第一章并开始渐进生成', async () => {
    mountApp('#proposal/book_x')
    await flushEffects()

    click('确认目录并生成')
    await flushEffects()

    expect(updateProposal).toHaveBeenCalledWith('book_x', expect.objectContaining({
      chapters: expect.arrayContaining([
        expect.objectContaining({ id: 'ch-1', title: proposalBook.chapters[0].title }),
      ]),
    }))
    expect(confirmBook).toHaveBeenCalledWith('book_x')
    expect(windowStub.location.hash).toBe('#book/book_x/ch-1')
    // 确认后先出现摸底入口，不自动开始生成；跳过摸底不阻塞直接生成
    expect(streamChapterGeneration).not.toHaveBeenCalled()
    expect(container.textContent).toContain('先摸底（5 题）')

    click('直接开始生成')
    await flushEffects()
    expect(getPretest).not.toHaveBeenCalled()
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1'])

    // chapter_start 到达后进入生成中视图：真实书显示“已生成 N 块”、无“完成本章生成”
    emitStream(streams[0], [{ type: 'chapter_start', chapterId: 'ch-1' }])
    expect(container.textContent).toContain('正在生成第一章')
    expect(container.textContent).not.toContain('完成本章生成')

    // 流式进度：已生成 N 块
    emitStream(streams[0], [
      { type: 'block', index: 0, block: learningBookFixture.chapters[0].blocks[0] },
      { type: 'block', index: 1, block: learningBookFixture.chapters[0].blocks[1] },
    ])
    expect(container.textContent).toContain('已生成 2 块')

    // chapter_done 后自动接 ch-2；ch-1 进入就绪视图，真实书不渲染块级重生成
    emitStream(streams[0], [{ type: 'chapter_done', blockCount: 2, warnings: [] }])
    streams[0].resolve()
    await flushEffects()
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1', 'ch-2'])
    expect(container.textContent).not.toContain('重生成')

    // ch-2 生成失败：记入书状态、继续 ch-3
    emitStream(streams[1], [
      { type: 'chapter_start', chapterId: 'ch-2' },
      { type: 'error', code: 'upstream_unavailable', message: '生成失败' },
    ])
    streams[1].resolve()
    await flushEffects()
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1', 'ch-2', 'ch-3'])

    // 其余章节跑完，再切到失败章重试
    for (const index of [2, 3]) {
      emitStream(streams[index], [
        { type: 'chapter_start', chapterId: streams[index].chapterId },
        { type: 'chapter_done', blockCount: 0, warnings: [] },
      ])
      streams[index].resolve()
      await flushEffects()
    }
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1', 'ch-2', 'ch-3', 'ch-4'])

    click('从误差到参数更新')
    expect(windowStub.location.hash).toBe('#book/book_x/ch-2')
    expect(container.textContent).toContain('这一章生成失败了')

    click('重新生成本章')
    await flushEffects()
    expect(streams).toHaveLength(5)
    expect(streams[4].chapterId).toBe('ch-2')

    emitStream(streams[4], [
      { type: 'chapter_start', chapterId: 'ch-2' },
      { type: 'chapter_done', blockCount: 0, warnings: [] },
    ])
    streams[4].resolve()
    await flushEffects()
    expect(container.textContent).not.toContain('这一章生成失败了')
  })

  it('先摸底：5 题提交后结论展示建议起点，章节轨标注可跳过/建议从这里开始', async () => {
    mountApp('#proposal/book_x')
    await flushEffects()

    click('确认目录并生成')
    await flushEffects()
    expect(streamChapterGeneration).not.toHaveBeenCalled()

    click('先摸底（5 题）')
    await flushEffects()
    expect(getPretest).toHaveBeenCalledWith('book_x')
    expect(container.textContent).toContain('监督学习需要什么信号？')

    // 选项文案可能与底层页面按钮撞文本，点击范围限定在摸底弹层内
    const sheet = () => {
      const element = descendants(container).find((candidate) => candidate.className.split(' ').includes('pretest-sheet'))
      expect(element, 'pretest sheet').toBeDefined()
      return element as FakeElement
    }
    for (const text of ['目标标签', '衡量预测误差', '无监督学习', '评估泛化能力', '是，有标签分类']) {
      clickWithin(sheet(), text)
    }
    clickWithin(sheet(), '提交摸底答案')
    await flushEffects()

    expect(submitPretest).toHaveBeenCalledWith('book_x', pretestResultPayload.answers)
    expect(container.textContent).toContain('摸底完成')
    expect(container.textContent).toContain('建议从第 2 章「从误差到参数更新」开始')

    const rail = descendants(container).find((element) => element.className.split(' ').includes('book-generation-rail'))
    expect(rail, 'chapter rail').toBeDefined()
    expect(rail!.textContent).toContain('可跳过')
    expect(rail!.textContent).toContain('建议从这里开始')

    clickWithin(sheet(), '从建议章节开始')
    await flushEffects()

    expect(windowStub.location.hash).toBe('#book/book_x/ch-2')
    expect(container.textContent).not.toContain('先摸底（5 题）')
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1'])
  })

  it('摸底弹层关闭后回到入口，直接开始生成不受影响', async () => {
    mountApp('#proposal/book_x')
    await flushEffects()

    click('确认目录并生成')
    await flushEffects()
    click('先摸底（5 题）')
    await flushEffects()
    expect(container.textContent).toContain('监督学习需要什么信号？')

    clickAriaLabel('关闭摸底面板')
    await flushEffects()
    expect(container.textContent).not.toContain('监督学习需要什么信号？')
    expect(container.textContent).toContain('先摸底（5 题）')
    expect(streamChapterGeneration).not.toHaveBeenCalled()

    click('直接开始生成')
    await flushEffects()
    expect(submitPretest).not.toHaveBeenCalled()
    expect(streams.map((stream) => stream.chapterId)).toEqual(['ch-1'])
  })

  it('打开已有摸底结论的书：章节轨直接展示标注，不重复请求摸底', async () => {
    vi.mocked(getBook).mockResolvedValue(realBookFixture({
      status: 'ready',
      chapters: learningBookFixture.chapters.map((chapter) => ({ ...chapter, status: 'ready' as const })),
      pretest: { questions: pretestQuestions, result: pretestResultPayload },
    }))
    mountApp('#book/book_x/ch-1')
    await flushEffects()

    const rail = descendants(container).find((element) => element.className.split(' ').includes('book-generation-rail'))
    expect(rail, 'chapter rail').toBeDefined()
    expect(rail!.textContent).toContain('可跳过')
    expect(rail!.textContent).toContain('建议从这里开始')
    expect(getPretest).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('先摸底（5 题）')
  })

  it('真实书答题走服务端：提交后展示最近一次结果、学习证据与章节掌握度', async () => {
    vi.mocked(getBook).mockResolvedValue(realBookFixture({
      status: 'ready',
      chapters: learningBookFixture.chapters.map((chapter) => ({ ...chapter, status: 'ready' as const })),
    }))
    vi.mocked(submitAttempt).mockResolvedValue({
      attempt: {
        id: 'attempt_1',
        chapterId: 'ch-1',
        blockId: 'blk-quiz-1',
        answerId: 'answer-b',
        isCorrect: true,
        submittedAt: '2026-08-11T01:00:00.000Z',
      },
      evidence: {
        id: 'evidence_1',
        chapterId: 'ch-1',
        conceptId: 'supervised-learning',
        sourceBlockId: 'blk-quiz-1',
        statement: '答对：没有标签的邮件被模型自动分组，这属于监督学习吗？',
        outcome: 'mastered',
        createdAt: '2026-08-11T01:00:00.000Z',
      },
      mastery: { chapter: 0.5, concept: 0.5 },
      schedule: null,
      diagnosis: null,
    })
    mountApp('#book/book_x/ch-1')
    await flushEffects()

    const quizBlock = descendants(container).find((element) => element.getAttribute('id') === 'blk-quiz-1')
    expect(quizBlock, 'real book quiz block').toBeDefined()
    expect(quizBlock!.textContent).not.toContain('学习证据')

    clickWithin(quizBlock!, '不属于，因为没有目标标签形成监督信号。')
    clickWithin(quizBlock!, '提交答案')
    await flushEffects()

    expect(submitAttempt).toHaveBeenCalledWith('book_x', 'blk-quiz-1', 'answer-b')
    expect(quizBlock!.textContent).toContain('回答正确。')
    expect(quizBlock!.textContent).toContain('答对：没有标签的邮件被模型自动分组，这属于监督学习吗？')
    // 章节掌握度由客户端从 attempts 派生：一次答对封顶 0.5 → 50%
    expect(container.textContent).toContain('掌握度 50%')
    // 概念学习状态派生：最近一次答对 → 已学习
    expect(container.textContent).toContain('已学习')
  })

  it('已持久化的作答在重新 getBook 后仍展示结果与掌握度，不重新提交', async () => {
    vi.mocked(getBook).mockResolvedValue(realBookFixture({
      status: 'ready',
      chapters: learningBookFixture.chapters.map((chapter) => ({ ...chapter, status: 'ready' as const })),
      quizAttempts: [{
        id: 'attempt_persisted',
        chapterId: 'ch-1',
        blockId: 'blk-quiz-1',
        answerId: 'answer-b',
        isCorrect: true,
        submittedAt: '2026-08-11T01:00:00.000Z',
      }],
      evidence: [{
        id: 'evidence_persisted',
        chapterId: 'ch-1',
        conceptId: 'supervised-learning',
        sourceBlockId: 'blk-quiz-1',
        statement: '答对：没有标签的邮件被模型自动分组，这属于监督学习吗？',
        outcome: 'mastered',
        createdAt: '2026-08-11T01:00:00.000Z',
      }],
    }))
    mountApp('#book/book_x/ch-1')
    await flushEffects()

    const quizBlock = descendants(container).find((element) => element.getAttribute('id') === 'blk-quiz-1')
    expect(quizBlock, 'real book quiz block').toBeDefined()
    expect(quizBlock!.textContent).toContain('回答正确。')
    expect(quizBlock!.textContent).toContain('答对：没有标签的邮件被模型自动分组，这属于监督学习吗？')
    expect(container.textContent).toContain('掌握度 50%')
    expect(submitAttempt).not.toHaveBeenCalled()
  })

  it('答错的块显示“重新作答”，重新提交后展示最新结果并重算掌握度', async () => {
    vi.mocked(getBook).mockResolvedValue(realBookFixture({
      status: 'ready',
      chapters: learningBookFixture.chapters.map((chapter) => ({ ...chapter, status: 'ready' as const })),
    }))
    vi.mocked(submitAttempt)
      .mockResolvedValueOnce({
        attempt: {
          id: 'attempt_wrong',
          chapterId: 'ch-1',
          blockId: 'blk-quiz-1',
          answerId: 'answer-a',
          isCorrect: false,
          submittedAt: '2026-08-11T01:00:00.000Z',
        },
        evidence: {
          id: 'evidence_wrong',
          chapterId: 'ch-1',
          conceptId: 'supervised-learning',
          sourceBlockId: 'blk-quiz-1',
          statement: '答错待复习：没有标签的邮件被模型自动分组，这属于监督学习吗？',
          outcome: 'review',
          createdAt: '2026-08-11T01:00:00.000Z',
        },
        mastery: { chapter: 0, concept: 0 },
        schedule: null,
        diagnosis: null,
      })
      .mockResolvedValueOnce({
        attempt: {
          id: 'attempt_correct',
          chapterId: 'ch-1',
          blockId: 'blk-quiz-1',
          answerId: 'answer-b',
          isCorrect: true,
          submittedAt: '2026-08-11T02:00:00.000Z',
        },
        evidence: {
          id: 'evidence_correct',
          chapterId: 'ch-1',
          conceptId: 'supervised-learning',
          sourceBlockId: 'blk-quiz-1',
          statement: '答对：没有标签的邮件被模型自动分组，这属于监督学习吗？',
          outcome: 'mastered',
          createdAt: '2026-08-11T02:00:00.000Z',
        },
        mastery: { chapter: 0.512821, concept: 0.512821 },
        schedule: null,
        diagnosis: null,
      })
    mountApp('#book/book_x/ch-1')
    await flushEffects()

    const quizBlock = descendants(container).find((element) => element.getAttribute('id') === 'blk-quiz-1')
    expect(quizBlock, 'real book quiz block').toBeDefined()

    clickWithin(quizBlock!, '属于，因为数据量足够大。')
    clickWithin(quizBlock!, '提交答案')
    await flushEffects()

    expect(quizBlock!.textContent).toContain('这次还没有答对。')
    expect(quizBlock!.textContent).toContain('答错待复习：没有标签的邮件被模型自动分组，这属于监督学习吗？')
    expect(container.textContent).toContain('掌握度 0%')
    // 概念学习状态派生：最近一次答错 → 待复习
    expect(container.textContent).toContain('待复习')

    clickWithin(quizBlock!, '重新作答')
    clickWithin(quizBlock!, '不属于，因为没有目标标签形成监督信号。')
    clickWithin(quizBlock!, '提交答案')
    await flushEffects()

    expect(submitAttempt).toHaveBeenCalledTimes(2)
    expect(submitAttempt).toHaveBeenLastCalledWith('book_x', 'blk-quiz-1', 'answer-b')
    // 最近一次结果：答对；(1×1 + 0×0.95) / 1.95 ≈ 0.512821 → 51%
    expect(quizBlock!.textContent).toContain('回答正确。')
    expect(quizBlock!.textContent).not.toContain('重新作答')
    expect(container.textContent).toContain('掌握度 51%')
    expect(container.textContent).toContain('已学习')
  })

  it('以 #book/{bookId}/{chapterId} 直接挂载时经 getBook 恢复阅读，不重走提案', async () => {
    vi.mocked(getBook).mockResolvedValue(realBookFixture({
      status: 'ready',
      chapters: learningBookFixture.chapters.map((chapter) => ({ ...chapter, status: 'ready' as const })),
    }))
    mountApp('#book/book_x/ch-2')
    await flushEffects()

    expect(getBook).toHaveBeenCalledWith('book_x')
    expect(updateProposal).not.toHaveBeenCalled()
    expect(confirmBook).not.toHaveBeenCalled()
    expect(streamChapterGeneration).not.toHaveBeenCalled()
    expect(container.textContent).toContain('从误差到参数更新')
    expect(container.textContent).not.toContain('确认目录并生成')
  })

  it('载入失败时显示可返回知识库的错误态', async () => {
    vi.mocked(getBook).mockRejectedValue(new BookApiError('book_not_found', '学习资料服务暂时不可用，请稍后重试。'))
    mountApp('#book/book_x/ch-1')
    await flushEffects()

    expect(container.textContent).toContain('学习书加载失败')
    expect(container.textContent).toContain('返回知识库')

    click('返回知识库')
    expect(windowStub.location.hash).toBe('#library')
    expect(container.textContent).not.toContain('学习书加载失败')
  })

  it('mock 书流程保持不变：确认、完成本章生成与块级重生成', async () => {
    mountApp('#library/ml-chapter-03')
    await flushEffects()

    expect(getBook).not.toHaveBeenCalled()
    expect(container.textContent).toContain('确认目录并生成')

    click('确认目录并生成')
    expect(windowStub.location.hash).toBe('#book/ml-chapter-03/ch-1')
    expect(container.textContent).toContain('正在生成第一章')
    expect(container.textContent).toContain('完成本章生成')

    click('完成本章生成')
    expect(container.textContent).toContain('重生成')
    expect(streamChapterGeneration).not.toHaveBeenCalled()
  })

  it('上传学习资料成功后创建学习书并跳到 #proposal/{bookId}', async () => {
    mountApp('#library')
    await flushEffects()

    click('上传学习资料')
    selectFile(new File([new Uint8Array([1, 2, 3])], '机器学习 · 第三章.pdf', { type: 'application/pdf' }))
    click('考试复习')
    click('入门')
    click('开始生成学习书')
    await flushEffects()

    expect(uploadDocument).toHaveBeenCalledOnce()
    expect(createBook).toHaveBeenCalledWith({ documentId: 'doc-1', goal: '考试复习', learnerLevel: '入门' })
    expect(windowStub.location.hash).toBe('#proposal/book_new')

    await flushEffects()
    expect(getBook).toHaveBeenCalledWith('book_new')
    expect(container.textContent).toContain('确认目录并生成')
  })

  it('上传失败时保留面板并显示稳定中文错误文案', async () => {
    vi.mocked(uploadDocument).mockRejectedValue(new BookApiError('pdf_too_large', '学习资料服务暂时不可用，请稍后重试。'))
    mountApp('#library')
    await flushEffects()

    click('上传学习资料')
    selectFile(new File([new Uint8Array([1, 2, 3])], 'chapter.pdf', { type: 'application/pdf' }))
    click('理解概念')
    click('入门')
    click('开始生成学习书')
    await flushEffects()

    expect(createBook).not.toHaveBeenCalled()
    expect(windowStub.location.hash).toBe('#library')
    expect(container.textContent).toContain('文件超过 20MB 上限')
    expect(container.textContent).toContain('上传学习资料')
  })

  it('确认目录被服务端拒绝时显示目录校验专项文案', async () => {
    vi.mocked(updateProposal).mockRejectedValue(new BookApiError('invalid_proposal_edit', '学习资料服务暂时不可用，请稍后重试。'))
    mountApp('#proposal/book_x')
    await flushEffects()

    click('确认目录并生成')
    await flushEffects()

    expect(confirmBook).not.toHaveBeenCalled()
    expect(windowStub.location.hash).toBe('#proposal/book_x')
    expect(container.textContent).toContain('目录修改未通过校验，请检查后重试。')
    expect(container.textContent).not.toContain('学习资料服务暂时不可用')
  })

  it.each([
    ['pdf_too_many_pages', '这份 PDF 超过 30 页上限，请拆分后再上传。'],
    ['pdf_encrypted', '这份 PDF 已加密，暂不支持解析。'],
    ['pdf_no_text', '这份 PDF 没有可提取的文字（可能是扫描件），暂不支持。'],
    ['pdf_unreadable', '这份 PDF 无法读取，请检查文件是否损坏。'],
  ])('上传失败 %s 时显示专项文案', async (code, expectedText) => {
    vi.mocked(uploadDocument).mockRejectedValue(new BookApiError(code, '学习资料服务暂时不可用，请稍后重试。'))
    mountApp('#library')
    await flushEffects()

    click('上传学习资料')
    selectFile(new File([new Uint8Array([1, 2, 3])], 'chapter.pdf', { type: 'application/pdf' }))
    click('理解概念')
    click('入门')
    click('开始生成学习书')
    await flushEffects()

    expect(createBook).not.toHaveBeenCalled()
    expect(container.textContent).toContain(expectedText)
    expect(container.textContent).not.toContain('学习资料服务暂时不可用')
  })

  it('真实书答错后出现章尾与章节轨复习入口；复习视图中答对后出队', async () => {
    vi.mocked(getBook).mockResolvedValue(realBookFixture({
      status: 'ready',
      chapters: learningBookFixture.chapters.map((chapter) => ({ ...chapter, status: 'ready' as const })),
    }))
    vi.mocked(submitAttempt)
      .mockResolvedValueOnce({
        attempt: {
          id: 'attempt_wrong',
          chapterId: 'ch-1',
          blockId: 'blk-quiz-1',
          answerId: 'answer-a',
          isCorrect: false,
          submittedAt: '2026-08-11T01:00:00.000Z',
        },
        evidence: {
          id: 'evidence_wrong',
          chapterId: 'ch-1',
          conceptId: 'supervised-learning',
          sourceBlockId: 'blk-quiz-1',
          statement: '答错待复习：没有标签的邮件被模型自动分组，这属于监督学习吗？',
          outcome: 'review',
          createdAt: '2026-08-11T01:00:00.000Z',
        },
        mastery: { chapter: 0, concept: 0 },
        schedule: null,
        diagnosis: null,
      })
      .mockResolvedValueOnce({
        attempt: {
          id: 'attempt_correct',
          chapterId: 'ch-1',
          blockId: 'blk-quiz-1',
          answerId: 'answer-b',
          isCorrect: true,
          submittedAt: '2026-08-11T02:00:00.000Z',
        },
        evidence: {
          id: 'evidence_correct',
          chapterId: 'ch-1',
          conceptId: 'supervised-learning',
          sourceBlockId: 'blk-quiz-1',
          statement: '答对：没有标签的邮件被模型自动分组，这属于监督学习吗？',
          outcome: 'mastered',
          createdAt: '2026-08-11T02:00:00.000Z',
        },
        mastery: { chapter: 0.512821, concept: 0.512821 },
        schedule: null,
        diagnosis: null,
      })
    mountApp('#book/book_x/ch-1')
    await flushEffects()

    // 无错题时不渲染任何复习入口
    expect(container.textContent).not.toContain('复习错题')

    const quizBlock = descendants(container).find((element) => element.getAttribute('id') === 'blk-quiz-1')
    clickWithin(quizBlock!, '属于，因为数据量足够大。')
    clickWithin(quizBlock!, '提交答案')
    await flushEffects()

    // 章尾入口（本章有错题）+ 章节轨书级入口（全书有错题）
    expect(container.textContent).toContain('复习本章错题')
    const rail = descendants(container).find((element) => element.className.split(' ').includes('book-generation-rail'))
    expect(rail!.textContent).toContain('复习错题（1）')

    // 切到无错题的章节：章尾入口消失，书级入口仍在
    click('从误差到参数更新')
    expect(container.textContent).not.toContain('复习本章错题')
    expect(rail!.textContent).toContain('复习错题（1）')

    // 书级入口打开复习视图：只含错题块
    click('复习错题（1）')
    await flushEffects()
    const sheet = () => {
      const element = descendants(container).find((candidate) => candidate.className.split(' ').includes('review-sheet'))
      expect(element, 'review sheet').toBeDefined()
      return element as FakeElement
    }
    expect(sheet().textContent).toContain('待复习 1 题')
    expect(sheet().textContent).toContain('没有标签的邮件被模型自动分组，这属于监督学习吗？')

    // 复习视图中重新作答并答对：该项出队，视图进入完成态，入口消失
    clickWithin(sheet(), '重新作答')
    clickWithin(sheet(), '不属于，因为没有目标标签形成监督信号。')
    clickWithin(sheet(), '提交答案')
    await flushEffects()

    expect(submitAttempt).toHaveBeenCalledTimes(2)
    expect(submitAttempt).toHaveBeenLastCalledWith('book_x', 'blk-quiz-1', 'answer-b')
    expect(sheet().textContent).toContain('错题都已答对，复习完成')
    expect(container.textContent).not.toContain('复习错题')

    clickAriaLabel('关闭错题复习')
    await flushEffects()
    expect(container.textContent).not.toContain('错题复习')
  })

  it('mock 原型页答错也不显示错题复习入口', async () => {
    mountApp('#library/ml-chapter-03')
    await flushEffects()

    click('确认目录并生成')
    click('完成本章生成')
    const quizBlock = descendants(container).find((element) => element.getAttribute('id') === 'blk-quiz-1')
    clickWithin(quizBlock!, '属于，因为数据量足够大。')
    clickWithin(quizBlock!, '提交答案')
    await flushEffects()

    expect(quizBlock!.textContent).toContain('这次还没有答对。')
    expect(container.textContent).not.toContain('复习错题')
    expect(submitAttempt).not.toHaveBeenCalled()
  })
})
