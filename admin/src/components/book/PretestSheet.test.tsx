import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { learningBookFixture } from '../../data/learningBook'
import { BookApiError } from '../../domain/learningBookApi'
import { getPretest, submitPretest } from '../../services/bookApi'
import type { BookChapter, LearningBook, PretestQuestion, PretestResult } from '../../types/learningBook'
import { PretestSheet } from './PretestSheet'

vi.mock('../../services/bookApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bookApi')>()
  return {
    ...actual,
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
  style: Record<string, string> & { setProperty: (name: string, value: string) => void }

  constructor(tagName: string, public ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase()
    this.nodeName = this.tagName
    const style = Object.create(null) as FakeElement['style']
    style.setProperty = (name: string, value: string) => { style[name] = value }
    this.style = style
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  setAttribute(name: string, value: string): void { this.attributes.set(name, value) }
  removeAttribute(name: string): void { this.attributes.delete(name) }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  focus(): void { this.ownerDocument.activeElement = this }

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

  addEventListener(): void {}
  removeEventListener(): void {}
  createElement(tagName: string) { return new FakeElement(tagName, this) }
  createElementNS(namespace: string, tagName: string) {
    const element = this.createElement(tagName)
    element.namespaceURI = namespace
    return element
  }
  createTextNode(value: string) { return new FakeText(value, this) }
}

const sheetChapters: BookChapter[] = learningBookFixture.chapters.map((chapter) => ({ ...chapter, blocks: [] }))

// 五题覆盖四章：ch-1 两题；除 pq-2 外正确选项都是 A
const pretestQuestions: PretestQuestion[] = [
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
      { id: 'pq-2-a', marker: 'A', text: '增加参数数量' },
      { id: 'pq-2-b', marker: 'B', text: '衡量预测误差' },
    ],
    correctAnswerId: 'pq-2-b',
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

const pretestResult: PretestResult = {
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

const resolvedBook: LearningBook = {
  ...learningBookFixture,
  id: 'book-1',
  pretest: { questions: pretestQuestions, result: pretestResult },
}

let mountedRoot: Root | undefined

afterEach(() => {
  if (mountedRoot) flushSync(() => mountedRoot?.unmount())
  mountedRoot = undefined
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function descendants(root: FakeElement): FakeElement[] {
  return root.childNodes.flatMap((child) => child instanceof FakeElement ? [child, ...descendants(child)] : [])
}

function mountEnvironment(): FakeElement {
  const documentStub = new FakeDocument()
  const windowStub = {
    document: documentStub,
    innerHeight: 844,
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    HTMLIFrameElement: class {},
    HTMLElement: FakeElement,
    Element: FakeElement,
    Node: FakeElement,
  }
  documentStub.defaultView = windowStub
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('Element', FakeElement)
  vi.stubGlobal('HTMLElement', FakeElement)
  vi.stubGlobal('Node', FakeElement)
  const container = new FakeElement('div', documentStub)
  mountedRoot = createRoot(container as unknown as Element)
  return container
}

interface RenderedSheet {
  container: FakeElement
  onResolved: ReturnType<typeof vi.fn>
  onStartFromChapter: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
}

function renderSheet(props: Partial<Parameters<typeof PretestSheet>[0]> = {}): RenderedSheet {
  const container = mountEnvironment()
  const onResolved = vi.fn()
  const onStartFromChapter = vi.fn()
  const onClose = vi.fn()
  flushSync(() => mountedRoot?.render(
    <PretestSheet
      bookId="book-1"
      chapters={sheetChapters}
      onResolved={onResolved}
      onStartFromChapter={onStartFromChapter}
      onClose={onClose}
      {...props}
    />,
  ))
  return { container, onResolved, onStartFromChapter, onClose }
}

async function flushEffects(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  flushSync(() => undefined)
}

function findButton(container: FakeElement, text: string): FakeElement {
  const button = descendants(container).find((element) => (
    element.tagName === 'BUTTON' && element.textContent.includes(text)
  ))
  expect(button, `button containing "${text}"`).toBeDefined()
  return button as FakeElement
}

function click(container: FakeElement, text: string): void {
  flushSync(() => Simulate.click(findButton(container, text) as unknown as Element))
}

function answerAllQuestions(container: FakeElement): void {
  for (const text of ['目标标签', '增加参数数量', '无监督学习', '评估泛化能力', '是，有标签分类']) {
    click(container, text)
  }
}

describe('PretestSheet', () => {
  it('加载成功后逐题作答，5 题答完才允许提交', async () => {
    vi.mocked(getPretest).mockResolvedValue({ questions: pretestQuestions, result: null })
    const { container } = renderSheet()

    expect(container.textContent).toContain('正在准备摸底题')
    await flushEffects()

    expect(getPretest).toHaveBeenCalledWith('book-1')
    expect(container.textContent).toContain('监督学习需要什么信号？')
    expect(findButton(container, '提交摸底答案').getAttribute('disabled')).not.toBeNull()

    click(container, '目标标签')
    expect(findButton(container, '提交摸底答案').getAttribute('disabled')).not.toBeNull()

    click(container, '增加参数数量')
    click(container, '无监督学习')
    click(container, '评估泛化能力')
    click(container, '是，有标签分类')
    expect(findButton(container, '提交摸底答案').getAttribute('disabled')).toBeNull()
  })

  it('提交成功后回调整书、展示结论与建议起点按钮', async () => {
    vi.mocked(getPretest).mockResolvedValue({ questions: pretestQuestions, result: null })
    vi.mocked(submitPretest).mockResolvedValue(resolvedBook)
    const { container, onResolved, onStartFromChapter } = renderSheet()
    await flushEffects()

    answerAllQuestions(container)
    click(container, '提交摸底答案')
    expect(container.textContent).toContain('提交中')
    await flushEffects()

    expect(submitPretest).toHaveBeenCalledWith('book-1', pretestResult.answers)
    expect(onResolved).toHaveBeenCalledWith(resolvedBook)
    expect(container.textContent).toContain('摸底完成')
    // 五题中 pq-2 答错 → 4/5
    expect(container.textContent).toContain('答对 4/5')
    expect(container.textContent).toContain('建议从第 2 章「从误差到参数更新」开始')
    expect(container.textContent).toContain('监督学习的判断起点')
    expect(container.textContent).toContain('可跳过')

    click(container, '从建议章节开始')
    expect(onStartFromChapter).toHaveBeenCalledWith('ch-2')
  })

  it('加载失败显示可重试的错误文案，重试后展示题目', async () => {
    vi.mocked(getPretest)
      .mockRejectedValueOnce(new BookApiError('upstream_unavailable', '学习资料服务暂时不可用，请稍后重试。'))
      .mockResolvedValueOnce({ questions: pretestQuestions, result: null })
    const { container } = renderSheet()
    await flushEffects()

    expect(container.textContent).toContain('摸底题加载失败，请检查网络后重试。')
    expect(container.textContent).not.toContain('监督学习需要什么信号？')

    click(container, '重新加载')
    await flushEffects()

    expect(getPretest).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('监督学习需要什么信号？')
  })

  it('提交失败显示可重试错误，再次提交成功进入结论', async () => {
    vi.mocked(getPretest).mockResolvedValue({ questions: pretestQuestions, result: null })
    vi.mocked(submitPretest)
      .mockRejectedValueOnce(new BookApiError('http_502', '学习资料服务暂时不可用，请稍后重试。'))
      .mockResolvedValueOnce(resolvedBook)
    const { container, onResolved } = renderSheet()
    await flushEffects()

    answerAllQuestions(container)
    click(container, '提交摸底答案')
    await flushEffects()

    expect(container.textContent).toContain('摸底提交失败，请检查网络后重试。')
    expect(onResolved).not.toHaveBeenCalled()
    expect(findButton(container, '提交摸底答案').getAttribute('disabled')).toBeNull()

    click(container, '提交摸底答案')
    await flushEffects()

    expect(submitPretest).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('摸底完成')
  })

  it('书中已有结论时直接展示结论，不重复请求题目', async () => {
    const { container, onStartFromChapter } = renderSheet({
      pretest: { questions: pretestQuestions, result: pretestResult },
    })
    await flushEffects()

    expect(getPretest).not.toHaveBeenCalled()
    expect(container.textContent).toContain('摸底完成')
    expect(container.textContent).toContain('建议从第 2 章「从误差到参数更新」开始')

    click(container, '从建议章节开始')
    expect(onStartFromChapter).toHaveBeenCalledWith('ch-2')
  })

  it('书中已有题目未提交时直接作答，不重复请求题目', async () => {
    const { container } = renderSheet({
      pretest: { questions: pretestQuestions, result: null },
    })
    await flushEffects()

    expect(getPretest).not.toHaveBeenCalled()
    expect(container.textContent).toContain('监督学习需要什么信号？')
    expect(findButton(container, '提交摸底答案').getAttribute('disabled')).not.toBeNull()
  })
})
