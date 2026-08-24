import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BookApiError } from '../../domain/learningBookApi'
import { submitFeynman } from '../../services/bookApi'
import { FeynmanCard } from './FeynmanCard'

vi.mock('../../services/bookApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bookApi')>()
  return {
    ...actual,
    submitFeynman: vi.fn(),
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

interface RenderedCard {
  container: FakeElement
  onReviewBlocks: ReturnType<typeof vi.fn>
}

function renderCard(props: Partial<Parameters<typeof FeynmanCard>[0]> = {}): RenderedCard {
  const container = mountEnvironment()
  const onReviewBlocks = vi.fn()
  flushSync(() => mountedRoot?.render(
    <FeynmanCard
      bookId="book-1"
      chapterId="ch-1"
      onReviewBlocks={onReviewBlocks}
      {...props}
    />,
  ))
  return { container, onReviewBlocks }
}

async function flushEffects(): Promise<void> {
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    flushSync(() => undefined)
  }
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

function typeExplanation(container: FakeElement, value: string): void {
  const textarea = descendants(container).find((element) => element.tagName === 'TEXTAREA')
  expect(textarea, 'explanation textarea').toBeDefined()
  ;(textarea as unknown as { value: string }).value = value
  flushSync(() => Simulate.change(textarea as unknown as Element, {}))
}

describe('FeynmanCard', () => {
  it('初始渲染输入框与字数计数，空内容不可提交', () => {
    const { container } = renderCard()

    expect(container.textContent).toContain('用自己的话讲讲')
    expect(container.textContent).toContain('0/2000')
    expect(findButton(container, '提交复述').getAttribute('disabled')).not.toBeNull()
  })

  it('输入后计数更新，提交显示评判中，passed 后展示鼓励与反馈', async () => {
    vi.mocked(submitFeynman).mockResolvedValue({
      passed: true,
      feedback: '讲得不错，抓住了找规律这条主线。',
      gap: '',
    })
    const { container } = renderCard()

    typeExplanation(container, '机器学习就是从数据里找规律，再用规律做预测。')
    expect(container.textContent).toContain('22/2000')

    click(container, '提交复述')
    expect(container.textContent).toContain('评判中')
    await flushEffects()

    expect(submitFeynman).toHaveBeenCalledWith('book-1', 'ch-1', '机器学习就是从数据里找规律，再用规律做预测。')
    expect(container.textContent).toContain('讲得不错，抓住了找规律这条主线。')
    expect(container.textContent).toContain('讲明白了')
  })

  it('未通过时展示 gap 与回看建议按钮，点击回跳本章内容', async () => {
    vi.mocked(submitFeynman).mockResolvedValue({
      passed: false,
      feedback: '方向对，但还差一点。',
      gap: '缺少「用规律做预测」这一环。',
    })
    const { container, onReviewBlocks } = renderCard()

    typeExplanation(container, '机器学习很厉害。')
    click(container, '提交复述')
    await flushEffects()

    expect(container.textContent).toContain('缺少「用规律做预测」这一环。')
    click(container, '回看本章内容')
    expect(onReviewBlocks).toHaveBeenCalledTimes(1)
  })

  it('评判失败显示错误文案，可重试并成功', async () => {
    vi.mocked(submitFeynman)
      .mockRejectedValueOnce(new BookApiError('upstream_unavailable', '学习资料服务暂时不可用，请稍后重试。'))
      .mockResolvedValueOnce({ passed: true, feedback: '讲清楚了。', gap: '' })
    const { container } = renderCard()

    typeExplanation(container, '机器学习就是从数据里找规律。')
    click(container, '提交复述')
    await flushEffects()

    expect(container.textContent).toContain('评判失败，请检查网络后重试。')
    expect(findButton(container, '提交复述').getAttribute('disabled')).toBeNull()

    click(container, '提交复述')
    await flushEffects()

    expect(submitFeynman).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('讲清楚了。')
  })
})
