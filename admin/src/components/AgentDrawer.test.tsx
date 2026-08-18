import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import katex from 'katex'
import type { BookAgentSessionState } from '../hooks/bookAgentSessionReducer'
import type { BookAgentSource } from '../types/bookAgent'
import { AgentDrawer } from './AgentDrawer'
import { BookBlockRenderer } from './book/BookBlockRenderer'
import { learningBookFixture } from '../data/learningBook'
import { advanceGeneration } from '../domain/learningBook'

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((tex: string) => `<span class="katex-mock">${tex}</span>`),
  },
}))

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

function invokeReactClick(element: FakeElement): void {
  flushSync(() => Simulate.click(element as unknown as Element))
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

const knownSource: BookAgentSource = {
  id: 'S1',
  sourceId: 'source-1',
  fileName: '机器学习 · 第三章.pdf',
  pageRange: '第 4–6 页',
  excerpt: '目标值参与预测比较，才能形成监督信号。',
  chapterId: 'ch-1',
  blockId: 'blk-explanation-1',
}

const unusedSource: BookAgentSource = {
  ...knownSource,
  id: 'S3',
  sourceId: 'source-3',
  pageRange: '第 8 页',
  excerpt: '这条来源没有被回答引用。',
}

const secondSource: BookAgentSource = {
  ...knownSource,
  id: 'S2',
  sourceId: 'source-2',
  pageRange: '第 7 页',
  excerpt: '先被回答提到的第二条来源。',
}

function renderControlled(session: BookAgentSessionState, contextEnabled = true): string {
  return renderToStaticMarkup(
    <AgentDrawer
      snap="full"
      activeDestination="library"
      contextLabel="第 1 章 · 从训练信号理解机器学习"
      contextEnabled={contextEnabled}
      draft=""
      bookSession={session}
      onDraftChange={() => undefined}
      onSnapChange={() => undefined}
      onSubmitQuestion={() => undefined}
      onStop={() => undefined}
      onRetry={() => undefined}
      onNewConversation={() => undefined}
      onContextEnabledChange={() => undefined}
      onSourceOpen={() => undefined}
    />,
  )
}

function session(overrides: Partial<BookAgentSessionState> = {}): BookAgentSessionState {
  return {
    id: 'book-1:chapter:ch-1',
    bookId: 'book-1',
    chapterId: 'ch-1',
    scope: 'chapter',
    status: 'idle',
    messages: [],
    ...overrides,
  }
}

describe('AgentDrawer controlled learning-book mode', () => {
  it('keeps a stable accessible name on the disabled streaming submit button', () => {
    const container = mountEnvironment()
    flushSync(() => mountedRoot?.render(<AgentDrawer
      snap="full"
      activeDestination="library"
      draft=""
      bookSession={session({ status: 'streaming', activeRequestId: 'request-1' })}
      onDraftChange={() => undefined}
      onSnapChange={() => undefined}
    />))
    const submit = descendants(container).find((element) => element.tagName === 'BUTTON' && element.getAttribute('type') === 'submit')

    expect(submit).toBeDefined()
    expect(submit?.getAttribute('aria-label')).toBe('发送问题')
    expect(submit?.getAttribute('disabled')).not.toBeNull()
  })

  it('uses semantic labelled containers instead of aria-labelled generic divs', () => {
    const sourceHtml = renderControlled(session({
      messages: [{ id: 'assistant-source', role: 'assistant', content: '依据见 [S1]。', status: 'complete', createdAt: '2026-08-09', sources: [knownSource] }],
    }))
    const actionHtml = renderControlled(session({
      status: 'error',
      messages: [{ id: 'assistant-error', role: 'assistant', content: '', status: 'error', createdAt: '2026-08-09' }],
    }))
    const emptyBookHtml = renderControlled(session())
    const legacyHtml = renderToStaticMarkup(<AgentDrawer
      snap="full"
      activeDestination="library"
      draft=""
      onDraftChange={() => undefined}
      onSnapChange={() => undefined}
    />)
    const combined = `${sourceHtml}${actionHtml}${emptyBookHtml}${legacyHtml}`
    const labelledDivs = combined.match(/<div\b[^>]*\baria-label=[^>]*>/gu) ?? []

    expect(labelledDivs.every((tag) => /\brole=/u.test(tag))).toBe(true)
    expect(sourceHtml).toMatch(/<ul\b[^>]*aria-label="回答引用的原文依据"/u)
    expect(sourceHtml).toMatch(/<ul\b[^>]*\brole="list"[^>]*aria-label="回答引用的原文依据"/u)
    expect(sourceHtml).toMatch(/<li><button\b/u)
    expect(sourceHtml).not.toMatch(/<section\b[^>]*aria-label="回答引用的原文依据"/u)
    expect(sourceHtml).toContain('aria-label="查看证据 S1：机器学习 · 第三章.pdf 第 4–6 页"')
    expect(sourceHtml).not.toContain('class="agent-session-actions"')
    expect(actionHtml).toMatch(/<div\b[^>]*role="group"[^>]*aria-label="本轮回答操作"/u)
    expect(emptyBookHtml).toMatch(/<div\b[^>]*role="group"[^>]*aria-label="学习书提问提示"/u)
    expect(legacyHtml).toMatch(/<div\b[^>]*role="group"[^>]*aria-label="继续追问"/u)
  })

  it('shows the book conversation input after legacy history was open before a surface switch', () => {
    const container = mountEnvironment()
    const common = {
      activeDestination: 'library' as const,
      draft: '',
      onDraftChange: () => undefined,
      onSnapChange: () => undefined,
    }
    flushSync(() => mountedRoot?.render(<AgentDrawer {...common} snap="full" />))
    const historyButton = descendants(container).find((element) => element.tagName === 'BUTTON' && element.textContent === '历史')
    expect(historyButton).toBeDefined()
    invokeReactClick(historyButton!)
    expect(container.textContent).toContain('最近对话')

    flushSync(() => mountedRoot?.render(<AgentDrawer {...common} snap="closed" />))
    flushSync(() => mountedRoot?.render(<AgentDrawer {...common} snap="full" bookSession={session()} />))

    expect(container.textContent).toContain('从当前章节开始')
    expect(descendants(container).some((element) => element.tagName === 'FORM')).toBe(true)
    expect(descendants(container).some((element) => element.tagName === 'INPUT')).toBe(true)
  })

  it('renders streaming, error, and cancelled states with explicit actions', () => {
    const streamingHtml = renderControlled(session({
      status: 'streaming',
      activeRequestId: 'request-1',
      messages: [{ id: 'assistant-1', role: 'assistant', content: '正在核对原文', status: 'streaming', createdAt: '2026-08-09' }],
    }))
    expect(streamingHtml).toContain('停止生成')
    expect(streamingHtml).toContain('aria-live="polite"')

    const errorHtml = renderControlled(session({
      status: 'error',
      errorMessage: '学习助手暂时不可用',
      messages: [{ id: 'assistant-2', role: 'assistant', content: '', status: 'error', createdAt: '2026-08-09' }],
    }))
    expect(errorHtml).toContain('重新尝试')
    expect(errorHtml).toContain('学习助手暂时不可用')

    const cancelledHtml = renderControlled(session({
      status: 'cancelled',
      messages: [{ id: 'assistant-3', role: 'assistant', content: '已生成的部分', status: 'cancelled', createdAt: '2026-08-09' }],
    }))
    expect(cancelledHtml).toContain('已停止')
    expect(cancelledHtml).toContain('重新尝试')
  })

  it('shows only real sources cited by an assistant answer', () => {
    const html = renderControlled(session({
      messages: [{
        id: 'assistant-4',
        role: 'assistant',
        content: '先看补充定义。[S2] 再看监督信号。[S1] 重复引用仍只显示一次。[S2] 未知来源不应出现。[S99]',
        status: 'complete',
        createdAt: '2026-08-09',
        sources: [knownSource, secondSource, unusedSource],
      }],
    }))

    expect(html).toContain('第 4–6 页')
    expect(html.indexOf('第 7 页')).toBeLessThan(html.indexOf('第 4–6 页'))
    expect(html).toContain('目标值参与预测比较')
    expect(html.match(/agent-source-card__index">证据 S2<\/span>/g)).toHaveLength(1)
    expect(html).not.toContain('第 8 页')
    expect(html).not.toContain('固定演示回答中的句子')
    expect(html).not.toContain('S99</')
  })

  it('keeps source cards actionable in controlled mode', () => {
    const onSourceOpen = vi.fn()
    const container = mountEnvironment()
    flushSync(() => mountedRoot?.render(<AgentDrawer
      snap="full"
      activeDestination="library"
      contextEnabled
      draft=""
      bookSession={session({
        messages: [{ id: 'assistant-5', role: 'assistant', content: '依据见 [S1]。', status: 'complete', createdAt: '2026-08-09', sources: [knownSource] }],
      })}
      onDraftChange={() => undefined}
      onSnapChange={() => undefined}
      onSourceOpen={onSourceOpen}
    />))
    const sourceButton = descendants(container).find((element) => element.tagName === 'BUTTON' && element.textContent.includes('证据 S1'))

    expect(sourceButton).toBeDefined()
    expect(sourceButton?.getAttribute('aria-label')).toBe('查看证据 S1：机器学习 · 第三章.pdf 第 4–6 页')
    invokeReactClick(sourceButton!)
    expect(onSourceOpen).toHaveBeenCalledTimes(1)
    expect(onSourceOpen).toHaveBeenCalledWith(knownSource)
  })

  it('clicks the rendered block Agent action with the exact block id', () => {
    const onAskAgent = vi.fn()
    const container = mountEnvironment()
    const block = advanceGeneration(learningBookFixture).chapters[0].blocks.find((candidate) => candidate.id === 'blk-explanation-1')!
    flushSync(() => mountedRoot?.render(<BookBlockRenderer
      block={block}
      onRegenerate={() => undefined}
      onSubmitQuiz={() => undefined}
      onUpdateNote={() => undefined}
      onStartDeepLearning={() => undefined}
      onAskAgent={onAskAgent}
    />))
    const askButton = descendants(container).find((element) => element.tagName === 'BUTTON' && element.textContent.includes('向 Agent 提问'))

    expect(askButton).toBeDefined()
    invokeReactClick(askButton!)
    expect(onAskAgent).toHaveBeenCalledTimes(1)
    expect(onAskAgent).toHaveBeenCalledWith('blk-explanation-1')
  })

  it('states explicitly when learning-book context is detached', () => {
    const html = renderControlled(session(), false)

    expect(html).toContain('重新附加学习书依据')
    expect(html).toContain('当前未附加学习书依据')
  })

  it('renders inline math in assistant answers via katex but keeps user text raw', async () => {
    const container = mountEnvironment()
    flushSync(() => mountedRoot?.render(<AgentDrawer
      snap="full"
      activeDestination="library"
      draft=""
      bookSession={session({
        messages: [
          { id: 'user-math', role: 'user', content: '为什么 $L$ 会下降？', status: 'complete', createdAt: '2026-08-09' },
          { id: 'assistant-math', role: 'assistant', content: '真实基数 $z_i$ 大于估计 $\\mu_i$。', status: 'complete', createdAt: '2026-08-09' },
        ],
      })}
      onDraftChange={() => undefined}
      onSnapChange={() => undefined}
    />))

    await vi.waitFor(() => {
      expect(katexMock.renderToString).toHaveBeenCalledWith('z_i', { displayMode: false, throwOnError: false })
      expect(katexMock.renderToString).toHaveBeenCalledWith('\\mu_i', { displayMode: false, throwOnError: false })
    })
    expect(katexMock.renderToString).not.toHaveBeenCalledWith('L', { displayMode: false, throwOnError: false })
    expect(container.textContent).toContain('为什么 $L$ 会下降？')
  })

  it('renders **bold** in assistant answers as strong emphasis without raw asterisks', () => {
    const container = mountEnvironment()
    flushSync(() => mountedRoot?.render(<AgentDrawer
      snap="full"
      activeDestination="library"
      draft=""
      bookSession={session({
        messages: [{ id: 'assistant-bold', role: 'assistant', content: '这正是 **核心依据** 没错。', status: 'complete', createdAt: '2026-08-09' }],
      })}
      onDraftChange={() => undefined}
      onSnapChange={() => undefined}
    />))
    const strong = descendants(container).find((element) => element.tagName === 'STRONG')

    expect(strong?.textContent).toBe('核心依据')
    expect(container.textContent).not.toContain('**')
  })

  it('turns cited [S#] markers into clickable chips and leaves unknown ones as text', () => {
    const onSourceOpen = vi.fn()
    const container = mountEnvironment()
    flushSync(() => mountedRoot?.render(<AgentDrawer
      snap="full"
      activeDestination="library"
      draft=""
      bookSession={session({
        messages: [{
          id: 'assistant-inline-source',
          role: 'assistant',
          content: '依据见 [S2]，而 [S99] 不存在。',
          status: 'complete',
          createdAt: '2026-08-09',
          sources: [knownSource, secondSource],
        }],
      })}
      onDraftChange={() => undefined}
      onSnapChange={() => undefined}
      onSourceOpen={onSourceOpen}
    />))
    const chip = descendants(container).find((element) => element.tagName === 'BUTTON' && element.className.split(' ').includes('agent-inline-source'))

    expect(chip).toBeDefined()
    expect(chip?.textContent).toContain('S2')
    invokeReactClick(chip!)
    expect(onSourceOpen).toHaveBeenCalledTimes(1)
    expect(onSourceOpen).toHaveBeenCalledWith(secondSource)
    const allChips = descendants(container).filter((element) => element.tagName === 'BUTTON' && element.className.split(' ').includes('agent-inline-source'))
    expect(allChips).toHaveLength(1)
    expect(container.textContent).toContain('[S99]')
  })
})
