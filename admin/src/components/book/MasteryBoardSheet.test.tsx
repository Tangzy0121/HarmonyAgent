import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MasteryBoardRow } from '../../domain/masteryBoard'
import { MasteryBoardSheet } from './MasteryBoardSheet'

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

function clickText(container: FakeElement, text: string): void {
  const button = descendants(container).find((element) => element.tagName === 'BUTTON' && element.textContent.includes(text))
  expect(button, `button containing "${text}"`).toBeDefined()
  flushSync(() => Simulate.click(button as unknown as Element))
}

const boardRows: MasteryBoardRow[] = [
  { chapterId: 'ch-1', chapterTitle: '第一章 监督学习', conceptId: 'c1', label: '概念甲', mastery: 0.5, state: '掌握中', blockId: 'blk-concept-1' },
  { chapterId: 'ch-1', chapterTitle: '第一章 监督学习', conceptId: 'c2', label: '概念乙', mastery: 0, state: '未学', blockId: 'blk-concept-1' },
  { chapterId: 'ch-2', chapterTitle: '第二章 误差', conceptId: 'c3', label: '概念丙', mastery: 0.92, state: '待复习', blockId: 'blk-concept-2' },
]

function renderSheet(rows: MasteryBoardRow[] = boardRows) {
  const container = mountEnvironment()
  const onOpenConcept = vi.fn()
  const onClose = vi.fn()
  flushSync(() => mountedRoot?.render(
    <MasteryBoardSheet rows={rows} onOpenConcept={onOpenConcept} onClose={onClose} />,
  ))
  return { container, onOpenConcept, onClose }
}

describe('MasteryBoardSheet · 掌握度看板', () => {
  it('按章分组渲染概念行与状态，点击行回调 onOpenConcept', () => {
    const { container, onOpenConcept } = renderSheet()

    expect(container.textContent).toContain('第一章 监督学习')
    expect(container.textContent).toContain('第二章 误差')
    expect(container.textContent).toContain('概念甲')
    expect(container.textContent).toContain('掌握中')
    expect(container.textContent).toContain('50%')
    expect(container.textContent).toContain('概念乙')
    expect(container.textContent).toContain('未学')
    expect(container.textContent).toContain('待复习')
    expect(container.textContent).toContain('92%')

    clickText(container, '概念甲')
    expect(onOpenConcept).toHaveBeenCalledTimes(1)
    expect(onOpenConcept).toHaveBeenCalledWith('ch-1', 'blk-concept-1')
  })

  it('点击关闭按钮回调 onClose', () => {
    const { container, onClose } = renderSheet()

    const closeButton = descendants(container).find((element) => element.getAttribute('aria-label') === '关闭')
    expect(closeButton, 'close button').toBeDefined()
    flushSync(() => Simulate.click(closeButton as unknown as Element))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
