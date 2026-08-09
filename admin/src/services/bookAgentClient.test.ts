import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BookAgentClientError,
  streamBookAgent,
  type BookAgentClientEvent,
  type BookAgentClientRequest,
} from './bookAgentClient'

const request: BookAgentClientRequest = {
  question: '为什么需要标签？',
  history: [{ role: 'user', content: '先解释监督学习。' }],
  context: null,
}

function streamResponse(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function encodedChunks(text: string, boundaries: number[]): Uint8Array[] {
  const bytes = new TextEncoder().encode(text)
  const points = [0, ...boundaries, bytes.length]
  return points.slice(0, -1).map((start, index) => bytes.slice(start, points[index + 1]))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamBookAgent', () => {
  it('posts to the exact dedicated URL and decodes event fields across arbitrary UTF-8 chunks', async () => {
    const payload = [
      'data: {"turnId":"turn-1"}\r\nevent: start\r\n\r\n',
      'event: sources\ndata: {"sources":[]}\n\n',
      'event: delta\ndata: {"text":"标签"}\n\n',
      'event: delta\ndata: {"text":"很重要"}\n\nevent: done\ndata: {}\n\n',
    ].join('')
    const labelByte = new TextEncoder().encode(payload.slice(0, payload.indexOf('标签'))).length
    let actualUrl: RequestInfo | URL | undefined
    let actualInit: RequestInit | undefined
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      actualUrl = url
      actualInit = init
      return streamResponse(encodedChunks(payload, [3, 11, labelByte + 1, labelByte + 4]))
    })
    vi.stubGlobal('fetch', fetchMock)
    const events: BookAgentClientEvent[] = []

    await streamBookAgent(request, { onEvent: (event) => events.push(event) })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(actualUrl).toBe('/api/agent/book-chat')
    expect(JSON.parse(String(actualInit?.body))).toEqual(request)
    expect(events).toEqual([
      { type: 'start', turnId: 'turn-1' },
      { type: 'sources', sources: [] },
      { type: 'delta', text: '标签' },
      { type: 'delta', text: '很重要' },
      { type: 'done' },
    ])
  })

  it('handles multiple events in one chunk and joins multiple data fields per event', async () => {
    const payload = [
      'event: start\ndata: {"turnId":\ndata: "turn-2"}\n\n',
      'event: delta\ndata: {"text":"A"}\n\n',
      'event: done\ndata: {"usage":{"total_tokens":3}}\n\n',
    ].join('')
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([new TextEncoder().encode(payload)])))
    const events: BookAgentClientEvent[] = []

    await streamBookAgent(request, { onEvent: (event) => events.push(event) })

    expect(events).toEqual([
      { type: 'start', turnId: 'turn-2' },
      { type: 'delta', text: 'A' },
      { type: 'done', usage: { total_tokens: 3 } },
    ])
  })

  it('supports lone-CR records and a CRLF split between chunks', async () => {
    const first = new TextEncoder().encode('event: start\r')
    const second = new TextEncoder().encode('\ndata: {"turnId":"turn-crlf"}\r\n\r\nevent: done\rdata: {}\r\r')
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([first, second])))
    const events: BookAgentClientEvent[] = []

    await streamBookAgent(request, { onEvent: (event) => events.push(event) })

    expect(events).toEqual([
      { type: 'start', turnId: 'turn-crlf' },
      { type: 'done' },
    ])
  })

  it('rejects malformed JSON and malformed recognized event shapes', async () => {
    const cases = [
      'event: delta\ndata: {bad json}\n\n',
      'event: delta\ndata: {"text":4}\n\n',
    ]

    for (const payload of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => streamResponse([new TextEncoder().encode(payload)])))
      await expect(streamBookAgent(request, { onEvent: vi.fn() })).rejects.toMatchObject({
        name: 'BookAgentClientError',
        code: 'invalid_stream',
      })
    }
  })

  it('turns an HTTP validation response into a stable pre-stream error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'question_required', debug: 'do not expose me' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )))

    const result = streamBookAgent(request, { onEvent: vi.fn() })

    await expect(result).rejects.toEqual(expect.objectContaining({
      name: 'BookAgentClientError',
      code: 'question_required',
    }))
    await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('do not expose me'))
  })

  it('preserves AbortError from fetch', async () => {
    const abortError = new DOMException('stopped', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(async () => { throw abortError }))

    await expect(streamBookAgent(request, { onEvent: vi.fn() })).rejects.toBe(abortError)
  })

  it('dispatches a provider-safe error event as a terminal event', async () => {
    const payload = 'event: error\ndata: {"code":"upstream_unavailable","message":"学习助手生成失败，请稍后重试。"}\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([new TextEncoder().encode(payload)])))
    const events: BookAgentClientEvent[] = []

    await streamBookAgent(request, { onEvent: (event) => events.push(event) })

    expect(events).toEqual([{
      type: 'error',
      code: 'upstream_unavailable',
      message: '学习助手生成失败，请稍后重试。',
    }])
  })

  it('ignores unknown events but rejects EOF without done or error', async () => {
    const payload = 'event: heartbeat\ndata: {}\n\nevent: delta\ndata: {"text":"partial"}\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([new TextEncoder().encode(payload)])))
    const events: BookAgentClientEvent[] = []

    await expect(streamBookAgent(request, { onEvent: (event) => events.push(event) })).rejects.toEqual(
      expect.objectContaining({ code: 'incomplete_stream' }),
    )
    expect(events).toEqual([{ type: 'delta', text: 'partial' }])
  })
})

describe('BookAgentClientError', () => {
  it('exposes only a stable code and message', () => {
    expect(new BookAgentClientError('network_error', '网络连接失败')).toMatchObject({
      name: 'BookAgentClientError',
      code: 'network_error',
      message: '网络连接失败',
    })
  })
})
