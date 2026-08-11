import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { learningBookFixture } from '../../data/learningBook'
import type { DueItem } from '../../services/bookApi'
import type { FlashCardsBlock, LearningBook } from '../../types/learningBook'
import { ReviewQueueSheet } from './ReviewQueueSheet'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(),
    render: vi.fn(),
  },
}))

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((tex: string) => `<span class="katex-mock">${tex}</span>`),
  },
}))

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
  innerHTML = ''
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

function findByClass(container: FakeElement, className: string): FakeElement {
  const element = descendants(container).find((candidate) => candidate.className.split(' ').includes(className))
  expect(element, `element with class "${className}"`).toBeDefined()
  return element as FakeElement
}

function click(element: FakeElement): void {
  flushSync(() => Simulate.click(element as unknown as Element))
}

function clickText(container: FakeElement, text: string): void {
  const button = descendants(container).find((element) => element.tagName === 'BUTTON' && element.textContent.includes(text))
  expect(button, `button containing "${text}"`).toBeDefined()
  click(button as FakeElement)
}

async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  flushSync(() => undefined)
}

const flashBlock: FlashCardsBlock = {
  id: 'blk-f1',
  type: 'flash_cards',
  status: 'ready',
  title: '术语速记',
  revision: 1,
  sourceAnchors: [],
  cards: [
    { front: '监督学习的信号是什么？', back: '目标标签。' },
  ],
}

const bookWithFlash: LearningBook = {
  ...learningBookFixture,
  chapters: learningBookFixture.chapters.map((chapter, index) => (
    index === 0 ? { ...chapter, blocks: [...chapter.blocks, flashBlock] } : chapter
  )),
}

const flashDue: DueItem = {
  blockId: 'blk-f1',
  chapterId: 'ch-1',
  kind: 'flash_cards',
  title: '术语速记',
  dueAt: '2026-08-11T01:00:00.000Z',
  stage: 1,
  lapses: 0,
}

const quizDue: DueItem = {
  blockId: 'blk-quiz-1',
  chapterId: 'ch-1',
  kind: 'quiz',
  title: '快速验证',
  dueAt: '2026-08-11T01:00:00.000Z',
  stage: 0,
  lapses: 1,
}

function renderSheet(options: {
  dueItems: DueItem[]
  onSubmitQuiz?: (blockId: string, answerId: string) => Promise<boolean>
  onFlashGrade?: (blockId: string, result: 'remembered' | 'forgotten') => Promise<void>
}): FakeElement {
  const container = mountEnvironment()
  flushSync(() => mountedRoot?.render(
    <ReviewQueueSheet
      book={bookWithFlash}
      dueItems={options.dueItems}
      onSubmitQuiz={options.onSubmitQuiz ?? (() => Promise.resolve(true))}
      onFlashGrade={options.onFlashGrade ?? (() => Promise.resolve())}
      onClose={() => undefined}
    />,
  ))
  return container
}

describe('ReviewQueueSheet · 到期复习', () => {
  it('闪卡到期项翻面后可自评记住了并回调 onFlashGrade', () => {
    const onFlashGrade = vi.fn().mockResolvedValue(undefined)
    const container = renderSheet({ dueItems: [flashDue], onFlashGrade })

    const card = findByClass(container, 'book-flashcards__card')
    expect(card.textContent).toContain('监督学习的信号是什么？')
    expect(card.textContent).not.toContain('目标标签。')

    click(card)
    expect(card.textContent).toContain('目标标签。')

    clickText(container, '记住了')
    expect(onFlashGrade).toHaveBeenCalledTimes(1)
    expect(onFlashGrade).toHaveBeenCalledWith('blk-f1', 'remembered')
  })

  it('闪卡到期项可自评没记住', () => {
    const onFlashGrade = vi.fn().mockResolvedValue(undefined)
    const container = renderSheet({ dueItems: [flashDue], onFlashGrade })

    clickText(container, '没记住')
    expect(onFlashGrade).toHaveBeenCalledWith('blk-f1', 'forgotten')
  })

  it('quiz 到期项渲染题目并用 onSubmitQuiz 重新作答', async () => {
    const onSubmitQuiz = vi.fn().mockResolvedValue(true)
    const container = renderSheet({ dueItems: [quizDue], onSubmitQuiz })

    expect(container.textContent).toContain('今日复习')
    expect(container.textContent).toContain('待复习 1 项')
    expect(container.textContent).toContain('没有标签的邮件被模型自动分组，这属于监督学习吗？')

    clickText(container, '不属于，因为没有目标标签形成监督信号。')
    clickText(container, '提交答案')
    await flushAsync()

    expect(onSubmitQuiz).toHaveBeenCalledTimes(1)
    expect(onSubmitQuiz).toHaveBeenCalledWith('blk-quiz-1', 'answer-b')
  })

  it('无到期项时显示全部复习完成', () => {
    const container = renderSheet({ dueItems: [] })

    expect(container.textContent).toContain('今天的复习都完成了')
    expect(container.textContent).not.toContain('待复习')
  })
})
