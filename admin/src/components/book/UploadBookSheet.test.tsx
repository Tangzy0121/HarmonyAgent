import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UploadBookSheet } from './UploadBookSheet'

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

function findButton(container: FakeElement, text: string): FakeElement {
  const button = descendants(container).find((element) => (
    element.tagName === 'BUTTON' && element.textContent.includes(text)
  ))
  expect(button, `button containing "${text}"`).toBeDefined()
  return button as FakeElement
}

function click(element: FakeElement): void {
  flushSync(() => Simulate.click(element as unknown as Element))
}

function selectFile(container: FakeElement, file: File): void {
  const input = descendants(container).find((element) => element.tagName === 'INPUT') as FakeElement
  expect(input).toBeDefined()
  input.files = [file]
  flushSync(() => Simulate.change(input as unknown as Element, {}))
}

function pdfFile(name: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'application/pdf' })
}

describe('UploadBookSheet static render', () => {
  it('renders goal and level groups, cloud/deletion note, and a disabled submit', () => {
    const html = renderToStaticMarkup(<UploadBookSheet onSubmit={() => undefined} onClose={() => undefined} />)

    expect(html).toContain('上传学习资料')
    expect(html).toContain('学习目标')
    expect(html).toContain('基础水平')
    for (const option of ['理解概念', '课程学习', '考试复习', '入门', '了解', '熟悉']) {
      expect(html).toContain(option)
    }
    expect(html).toContain('云端')
    expect(html).toContain('删除')
    expect(html).toContain('20MB')
    expect(html.match(/disabled=""/gu)?.length).toBeGreaterThanOrEqual(1)
  })
})

describe('UploadBookSheet interaction', () => {
  it('submits the selected file, goal, and level', () => {
    const container = mountEnvironment()
    const onSubmit = vi.fn()
    flushSync(() => mountedRoot?.render(<UploadBookSheet onSubmit={onSubmit} onClose={() => undefined} />))
    const file = pdfFile('机器学习 · 第三章.pdf', 1024 * 1024)

    selectFile(container, file)
    expect(container.textContent).toContain('机器学习 · 第三章.pdf')
    expect(container.textContent).toContain('1.0 MB')
    click(findButton(container, '考试复习'))
    click(findButton(container, '入门'))

    const submit = findButton(container, '开始生成学习书')
    expect(submit.getAttribute('disabled')).toBeNull()
    click(submit)

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith({ file, goal: '考试复习', learnerLevel: '入门' })
  })

  it('shows the pdf_too_large copy for files over 20MB and never submits', () => {
    const container = mountEnvironment()
    const onSubmit = vi.fn()
    flushSync(() => mountedRoot?.render(<UploadBookSheet onSubmit={onSubmit} onClose={() => undefined} />))

    selectFile(container, pdfFile('big.pdf', 20 * 1024 * 1024 + 1))
    expect(container.textContent).toContain('20MB')

    click(findButton(container, '理解概念'))
    click(findButton(container, '熟悉'))
    const submit = findButton(container, '开始生成学习书')
    expect(submit.getAttribute('disabled')).not.toBeNull()
    click(submit)

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps submit disabled while the goal or level is missing', () => {
    const container = mountEnvironment()
    flushSync(() => mountedRoot?.render(<UploadBookSheet onSubmit={() => undefined} onClose={() => undefined} />))

    selectFile(container, pdfFile('chapter.pdf', 2048))
    expect(findButton(container, '开始生成学习书').getAttribute('disabled')).not.toBeNull()

    click(findButton(container, '课程学习'))
    expect(findButton(container, '开始生成学习书').getAttribute('disabled')).not.toBeNull()

    click(findButton(container, '了解'))
    expect(findButton(container, '开始生成学习书').getAttribute('disabled')).toBeNull()
  })

  it('blocks duplicate submits while a submission is in flight', async () => {
    const container = mountEnvironment()
    let release: () => void = () => undefined
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    flushSync(() => mountedRoot?.render(<UploadBookSheet onSubmit={onSubmit} onClose={() => undefined} />))

    selectFile(container, pdfFile('chapter.pdf', 2048))
    click(findButton(container, '理解概念'))
    click(findButton(container, '入门'))
    click(findButton(container, '开始生成学习书'))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(findButton(container, '上传中').getAttribute('disabled')).not.toBeNull()
    click(findButton(container, '上传中'))
    expect(onSubmit).toHaveBeenCalledOnce()

    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    flushSync(() => undefined)
    expect(findButton(container, '开始生成学习书').getAttribute('disabled')).toBeNull()
  })

  it('invokes onClose from the close button and the scrim', () => {
    const container = mountEnvironment()
    const onClose = vi.fn()
    flushSync(() => mountedRoot?.render(<UploadBookSheet onSubmit={() => undefined} onClose={onClose} />))

    const closeButton = descendants(container).find((element) => (
      element.tagName === 'BUTTON' && element.getAttribute('aria-label') === '关闭'
    )) as FakeElement
    click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)

    const scrim = descendants(container).find((element) => (
      element.tagName === 'BUTTON' && element.getAttribute('aria-label') === '关闭上传面板'
    )) as FakeElement
    click(scrim)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
