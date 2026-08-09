import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { learningBookFixture } from '../data/learningBook'
import {
  streamBookAgent,
  type BookAgentClientEvent,
  type BookAgentClientRequest,
  type StreamBookAgentOptions,
} from '../services/bookAgentClient'
import { useBookAgentSessions, type UseBookAgentSessionsResult } from './useBookAgentSessions'

vi.mock('../services/bookAgentClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bookAgentClient')>()
  return { ...actual, streamBookAgent: vi.fn() }
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

interface PendingCall {
  request: BookAgentClientRequest
  options: StreamBookAgentOptions
  resolve: () => void
  reject: (error: unknown) => void
}

const calls: PendingCall[] = []
let documentStub: FakeDocument
let container: FakeElement
let root: Root
let latest: UseBookAgentSessionsResult
let fireDuringRender: (() => void) | undefined

function Harness({ chapterId }: { chapterId: string }) {
  latest = useBookAgentSessions({
    book: learningBookFixture,
    activeChapterId: chapterId,
    scope: 'chapter',
    contextEnabled: false,
  })
  const fire = fireDuringRender
  fireDuringRender = undefined
  fire?.()
  return null
}

function render(chapterId: string): void {
  flushSync(() => root.render(createElement(Harness, { chapterId })))
}

function emit(call: PendingCall, event: BookAgentClientEvent): void {
  flushSync(() => call.options.onEvent(event))
}

function submit(question: string): Promise<void> {
  let pending!: Promise<void>
  flushSync(() => {
    pending = latest.submit(question)
  })
  return pending
}

async function complete(call: PendingCall, answer: string): Promise<void> {
  emit(call, { type: 'delta', text: answer })
  emit(call, { type: 'done' })
  call.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  calls.length = 0
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
  vi.mocked(streamBookAgent).mockImplementation((request, options) => new Promise<void>((resolve, reject) => {
    calls.push({ request, options, resolve, reject })
    options.signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true })
  }))
  container = new FakeElement('div', documentStub)
  root = createRoot(container as unknown as Element)
  render('ch-1')
})

afterEach(() => {
  flushSync(() => root.unmount())
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('useBookAgentSessions', () => {
  it('aborts and freezes the old session when a terminal event races a session-key render switch', async () => {
    void submit('old chapter question')
    expect(calls).toHaveLength(1)
    const oldCall = calls[0]
    fireDuringRender = () => {
      oldCall.options.onEvent({ type: 'done' })
      oldCall.resolve()
    }

    render('ch-2')
    await Promise.resolve()

    expect(oldCall.options.signal?.aborted).toBe(true)
    expect(latest.session.id).toBe('book-ml-chapter-03:chapter:ch-2')
    render('ch-1')
    expect(latest.session.status).toBe('cancelled')
    expect(latest.session.messages[1]).toMatchObject({ status: 'cancelled', content: '' })
  })

  it('omits an errored orphan user turn from the next ordinary submit history', async () => {
    const first = submit('completed question')
    await complete(calls[0], 'completed answer')
    await first

    const failed = submit('failed question')
    emit(calls[1], { type: 'error', code: 'upstream_unavailable', message: 'failed safely' })
    calls[1].resolve()
    await failed

    expect(latest.session.messages.map(({ role, status, content }) => ({ role, status, content }))).toEqual([
      { role: 'user', status: 'complete', content: 'completed question' },
      { role: 'assistant', status: 'complete', content: 'completed answer' },
      { role: 'user', status: 'complete', content: 'failed question' },
      { role: 'assistant', status: 'error', content: '' },
    ])

    void submit('next question')
    expect(calls[2].request.history).toEqual([
      { role: 'user', content: 'completed question' },
      { role: 'assistant', content: 'completed answer' },
    ])
  })

  it('omits a cancelled orphan user turn from the next ordinary submit history', async () => {
    const first = submit('completed question')
    await complete(calls[0], 'completed answer')
    await first

    void submit('cancelled question')
    const cancelled = calls[1]
    flushSync(() => latest.stop())
    await Promise.resolve()
    expect(cancelled.options.signal?.aborted).toBe(true)
    expect(latest.session.messages.map(({ role, status, content }) => ({ role, status, content }))).toEqual([
      { role: 'user', status: 'complete', content: 'completed question' },
      { role: 'assistant', status: 'complete', content: 'completed answer' },
      { role: 'user', status: 'complete', content: 'cancelled question' },
      { role: 'assistant', status: 'cancelled', content: '' },
    ])

    void submit('next question')
    expect(calls[2].request.history).toEqual([
      { role: 'user', content: 'completed question' },
      { role: 'assistant', content: 'completed answer' },
    ])
  })
})
