import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import mermaid from 'mermaid'
import katex from 'katex'
import type { BookBlock, CalloutBlock, FigureBlock, FlashCardsBlock, FormulaBlock } from '../../types/learningBook'
import { BookBlockRenderer } from './BookBlockRenderer'

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

const mermaidMock = vi.mocked(mermaid)
const katexMock = vi.mocked(katex)

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

beforeEach(() => {
  mermaidMock.parse.mockResolvedValue({ diagramType: 'flowchart' } as never)
  mermaidMock.render.mockResolvedValue({ svg: '<svg data-figure="ok"><text>流程</text></svg>' } as never)
})

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

function renderBlock(block: BookBlock): FakeElement {
  const container = mountEnvironment()
  flushSync(() => mountedRoot?.render(
    <BookBlockRenderer
      block={block}
      onRegenerate={() => undefined}
      onSubmitQuiz={() => undefined}
      onUpdateNote={() => undefined}
      onStartDeepLearning={() => undefined}
      onAskAgent={() => undefined}
    />,
  ))
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

const calloutBlock: CalloutBlock = {
  id: 'blk-callout-1',
  type: 'callout',
  status: 'ready',
  title: '易混提醒',
  revision: 1,
  sourceAnchors: [],
  kind: 'pitfall',
  body: '别混淆训练信号与数据量。',
}

const flashCardsBlock: FlashCardsBlock = {
  id: 'blk-flash-1',
  type: 'flash_cards',
  status: 'ready',
  title: '术语速记',
  revision: 1,
  sourceAnchors: [],
  cards: [
    { front: '正面一', back: '背面一', hint: '提示一' },
    { front: '正面二', back: '背面二' },
  ],
}

const figureBlock: FigureBlock = {
  id: 'blk-figure-1',
  type: 'figure',
  status: 'ready',
  title: '训练流程',
  revision: 1,
  sourceAnchors: [],
  kind: 'flowchart',
  mermaid: 'flowchart LR\n  A-->B',
  caption: '训练流程示意',
}

describe('BookBlockRenderer · callout', () => {
  it('renders the kind-specific modifier class, label, and body', () => {
    const container = renderBlock(calloutBlock)
    const callout = findByClass(container, 'book-callout--pitfall')

    expect(callout.getAttribute('role')).toBe('note')
    expect(callout.textContent).toContain('常见坑')
    expect(callout.textContent).toContain('别混淆训练信号与数据量。')
    expect(container.textContent).toContain('学习提示')
  })
})

describe('BookBlockRenderer · flash_cards', () => {
  it('shows the first card front and flips on click with aria-pressed in sync', () => {
    const container = renderBlock(flashCardsBlock)
    const card = findByClass(container, 'book-flashcards__card')

    // 卡片是原生 button：Enter/Space 由浏览器原生激活 click，无需额外键盘处理
    expect(card.tagName).toBe('BUTTON')
    expect(card.getAttribute('aria-pressed')).toBe('false')
    expect(card.textContent).toContain('正面一')
    expect(card.textContent).not.toContain('背面一')
    expect(container.textContent).toContain('1 / 2')
    expect(container.textContent).toContain('记忆闪卡')

    click(card)
    expect(card.textContent).toContain('背面一')
    expect(card.getAttribute('aria-pressed')).toBe('true')
  })

  it('navigates to the next card via the 下一张闪卡 button and resets the flip', () => {
    const container = renderBlock(flashCardsBlock)
    const card = findByClass(container, 'book-flashcards__card')
    click(card)

    const next = descendants(container).find((element) => (
      element.tagName === 'BUTTON' && element.getAttribute('aria-label') === '下一张闪卡'
    ))
    expect(next, 'next card button').toBeDefined()
    click(next as FakeElement)

    expect(card.textContent).toContain('正面二')
    expect(card.textContent).not.toContain('背面二')
    expect(card.getAttribute('aria-pressed')).toBe('false')
    expect(container.textContent).toContain('2 / 2')
  })
})

describe('BookBlockRenderer · figure', () => {
  it('lazy-loads mermaid, renders the svg into the canvas, and shows the caption', async () => {
    const container = renderBlock(figureBlock)

    // 动态 import 的解析时机随全量套件负载波动，轮询渲染终态而不是数固定 tick
    await vi.waitFor(() => {
      expect(findByClass(container, 'book-figure__canvas').innerHTML).toContain('<svg')
    })

    expect(mermaidMock.initialize).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: expect.objectContaining({ fontSize: '16px' }),
    }))
    expect(mermaidMock.parse).toHaveBeenCalledWith(figureBlock.mermaid)
    expect(container.textContent).toContain('训练流程示意')
    expect(container.textContent).toContain('图解')
  })

  it('falls back to the source view without throwing when mermaid.parse rejects', async () => {
    mermaidMock.parse.mockRejectedValue(new Error('bad syntax'))
    const container = renderBlock(figureBlock)

    await vi.waitFor(() => {
      expect(container.textContent).toContain('图示生成失败')
    })
    const details = descendants(container).find((element) => element.tagName === 'DETAILS')
    expect(details, 'fallback details').toBeDefined()
    expect(details!.textContent).toContain('flowchart LR')
  })
})

describe('BookBlockRenderer · formula（KaTeX）', () => {
  const formulaBlock: FormulaBlock = {
    id: 'blk-formula-1',
    type: 'formula',
    status: 'ready',
    title: '均方误差',
    revision: 1,
    sourceAnchors: [],
    formula: 'L = \\frac{1}{n} \\sum_{i=1}^{n} (y_i - \\hat{y}_i)^2',
    explanation: '误差越小越好。',
  }

  it('lazy-loads katex and renders the formula in display mode without throwing on error', async () => {
    const container = renderBlock(formulaBlock)

    await vi.waitFor(() => {
      expect(findByClass(container, 'katex-host--display').innerHTML).toContain('katex-mock')
    })
    expect(katexMock.renderToString).toHaveBeenCalledWith(formulaBlock.formula, { displayMode: true, throwOnError: false })
    expect(container.textContent).toContain('误差越小越好。')
  })

  it('renders inline $...$ segments in explanation body via katex', async () => {
    const explanation: BookBlock = {
      id: 'blk-explanation-math',
      type: 'explanation',
      status: 'ready',
      title: '参数更新',
      revision: 1,
      sourceAnchors: [],
      body: '梯度下降按 $\\theta \\leftarrow \\theta - \\eta \\nabla L$ 迭代更新参数。',
      keyPoint: '沿着负梯度走。',
    }
    renderBlock(explanation)

    await vi.waitFor(() => {
      expect(katexMock.renderToString).toHaveBeenCalledWith('\\theta \\leftarrow \\theta - \\eta \\nabla L', { displayMode: false, throwOnError: false })
    })
  })

  it('renders inline math in formula explanation, callout body and flash card text', async () => {
    const formula: FormulaBlock = {
      id: 'blk-formula-2',
      type: 'formula',
      status: 'ready',
      title: '单侧偏差',
      revision: 1,
      sourceAnchors: [],
      formula: 'd_i = z_i - \\mu_i',
      explanation: '真实基数 $z_i$ 大于估计 $\\mu_i$ 时被低估。',
    }
    renderBlock(formula)
    await vi.waitFor(() => {
      expect(katexMock.renderToString).toHaveBeenCalledWith('z_i', { displayMode: false, throwOnError: false })
      expect(katexMock.renderToString).toHaveBeenCalledWith('\\mu_i', { displayMode: false, throwOnError: false })
    })

    katexMock.renderToString.mockClear()
    renderBlock({ ...calloutBlock, body: '注意 $\\eta$ 过大会震荡。' })
    await vi.waitFor(() => {
      expect(katexMock.renderToString).toHaveBeenCalledWith('\\eta', { displayMode: false, throwOnError: false })
    })

    katexMock.renderToString.mockClear()
    renderBlock({ ...flashCardsBlock, cards: [{ front: '学习率 $\\eta$', back: '步长' }, { front: '甲', back: '乙' }, { front: '丙', back: '丁' }] })
    await vi.waitFor(() => {
      expect(katexMock.renderToString).toHaveBeenCalledWith('\\eta', { displayMode: false, throwOnError: false })
    })
  })
})

describe('BookBlockRenderer · figure 大图', () => {
  it('opens a zoom dialog on canvas click, scales with 继续放大, and closes via 关闭大图', async () => {
    const container = renderBlock(figureBlock)
    await vi.waitFor(() => {
      expect(findByClass(container, 'book-figure__canvas').innerHTML).toContain('<svg')
    })

    const canvas = findByClass(container, 'book-figure__canvas')
    expect(canvas.tagName).toBe('BUTTON')
    expect(canvas.getAttribute('aria-label')).toBe('放大查看训练流程示意')
    click(canvas)

    const dialog = findByClass(container, 'book-figure-zoom')
    expect(dialog.getAttribute('role')).toBe('dialog')
    const zoomContent = () => findByClass(container, 'book-figure-zoom__content')
    expect(zoomContent().style.transform).toBe('translate(0px, 0px) scale(1)')
    expect(zoomContent().innerHTML).toContain('<svg')

    const zoomIn = descendants(container).find((element) => element.tagName === 'BUTTON' && element.getAttribute('aria-label') === '继续放大')
    expect(zoomIn, 'zoom in button').toBeDefined()
    click(zoomIn as FakeElement)
    expect(zoomContent().style.transform).toBe('translate(0px, 0px) scale(1.5)')

    const close = descendants(container).find((element) => element.tagName === 'BUTTON' && element.getAttribute('aria-label') === '关闭大图')
    expect(close, 'close button').toBeDefined()
    click(close as FakeElement)
    expect(descendants(container).some((element) => element.className.split(' ').includes('book-figure-zoom'))).toBe(false)
  })

  it('pans the zoomed figure by pointer drag and resets the view', async () => {
    const container = renderBlock(figureBlock)
    await vi.waitFor(() => {
      expect(findByClass(container, 'book-figure__canvas').innerHTML).toContain('<svg')
    })
    click(findByClass(container, 'book-figure__canvas'))

    const stage = findByClass(container, 'book-figure-zoom__stage')
    const zoomContent = () => findByClass(container, 'book-figure-zoom__content')
    type PointerData = Parameters<typeof Simulate.pointerDown>[1]
    const pointerAt = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y }) as unknown as PointerData
    flushSync(() => Simulate.pointerDown(stage as unknown as Element, pointerAt(100, 100)))
    flushSync(() => Simulate.pointerMove(stage as unknown as Element, pointerAt(160, 140)))
    expect(zoomContent().style.transform).toBe('translate(60px, 40px) scale(1)')
    flushSync(() => Simulate.pointerUp(stage as unknown as Element, pointerAt(160, 140)))

    // 拖拽松手后再次移动不再平移
    flushSync(() => Simulate.pointerMove(stage as unknown as Element, pointerAt(300, 300)))
    expect(zoomContent().style.transform).toBe('translate(60px, 40px) scale(1)')

    const reset = descendants(container).find((element) => element.tagName === 'BUTTON' && element.getAttribute('aria-label') === '重置缩放')
    click(reset as FakeElement)
    expect(zoomContent().style.transform).toBe('translate(0px, 0px) scale(1)')
  })
})

describe('BookBlockRenderer · 旧块类型回归', () => {
  it('still renders an explanation block with body, key point, and type label', () => {
    const explanation: BookBlock = {
      id: 'blk-explanation-1',
      type: 'explanation',
      status: 'ready',
      title: '先判断训练信号',
      revision: 1,
      sourceAnchors: [],
      body: '监督学习的关键是训练样本提供目标答案。',
      keyPoint: '先问训练时有没有目标答案。',
    }
    const container = renderBlock(explanation)

    expect(container.textContent).toContain('核心讲解')
    expect(container.textContent).toContain('监督学习的关键是训练样本提供目标答案。')
    expect(container.textContent).toContain('先问训练时有没有目标答案。')
    expect(container.textContent).not.toContain('暂不受当前版本支持')
  })
})
