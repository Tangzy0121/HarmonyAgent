import http from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { createBookAgentRouter } from '../src/routes/bookAgent.js'

const API_KEY = 'test-only-secret-key'

function validBody() {
  return {
    question: '为什么标签很重要？',
    history: [{ role: 'user', content: '先解释监督学习。' }],
    context: {
      bookId: 'book-1',
      title: '机器学习入门',
      scope: 'chapter',
      label: '第 1 章',
      focusBlockId: 'block-1',
      chapters: [{
        id: 'chapter-1',
        title: '监督学习',
        objective: '理解标签',
        blocks: [{
          id: 'block-1',
          type: 'explanation',
          title: '标签',
          content: '标签为训练样本提供目标。',
          sourceIds: ['S1'],
          userAuthored: false,
        }],
      }],
      sources: [{
        id: 'S1',
        sourceId: 'source-1',
        fileName: 'lecture.pdf',
        pageRange: '4-5',
        excerpt: '训练数据包含输入和对应标签。',
        chapterId: 'chapter-1',
        blockId: 'block-1',
      }],
      warnings: [],
    },
  }
}

function appWith(
  fetchImpl: typeof fetch,
  apiKey = API_KEY,
  createTurnId: () => string = () => 'turn-test-1',
) {
  const app = express()
  app.use(express.json())
  app.use('/api/agent', createBookAgentRouter({
    fetchImpl,
    env: {
      LLM_API_KEY: apiKey,
      LLM_BASE_URL: 'https://api.deepseek.example/',
      LLM_MODEL: '',
    },
    createTurnId,
  }))
  return app
}

function routeOwnedJsonApp(fetchImpl: typeof fetch) {
  const app = express()
  app.use('/api/agent', createBookAgentRouter({
    fetchImpl,
    env: {
      LLM_API_KEY: API_KEY,
      LLM_BASE_URL: 'https://api.deepseek.example/',
      LLM_MODEL: 'deepseek-v4-flash',
    },
    createTurnId: () => 'turn-test-1',
  }))
  return app
}

function upstreamStream(parts: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function eventsFrom(responseText: string): Array<{ event: string; data: unknown }> {
  return responseText
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split('\n')
      return {
        event: lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '',
        data: JSON.parse(lines.find((line) => line.startsWith('data: '))?.slice(6) ?? 'null'),
      }
    })
}

describe('POST /api/agent/book-chat', () => {
  it('returns stable JSON for malformed JSON without exposing parser internals', async () => {
    const response = await request(routeOwnedJsonApp(vi.fn<typeof fetch>()))
      .post('/api/agent/book-chat')
      .set('Content-Type', 'application/json')
      .send('{"question":')

    expect(response.status).toBe(400)
    expect(response.type).toMatch(/json/u)
    expect(response.body).toEqual({ error: 'invalid_json' })
    expect(response.text).not.toMatch(/SyntaxError|node_modules|bookAgentRoute\.test|Unexpected token/iu)
  })

  it('rejects an invalid request before opening an SSE response', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const response = await request(appWith(fetchImpl)).post('/api/agent/book-chat').send({ question: ' ' })

    expect(response.status).toBe(400)
    expect(response.type).toMatch(/json/u)
    expect(response.body).toEqual({ error: 'question_required' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 503 without contacting upstream when the server key is absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const response = await request(appWith(fetchImpl, '')).post('/api/agent/book-chat').send(validBody())

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'agent_not_configured', message: '学习助手暂时不可用，请稍后再试。' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends a server-built grounded request and translates the upstream stream in order', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamStream([
      'data: {"choices":[{"delta":{"content":"标签提供"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"学习目标。[S1]"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":5,"total_tokens":25}}\n\n',
      'data: [DONE]\n\n',
    ]))

    const response = await request(appWith(fetchImpl)).post('/api/agent/book-chat').send(validBody())

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.headers['cache-control']).toBe('no-cache, no-transform')
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.deepseek.example/chat/completions')
    expect(options?.method).toBe('POST')
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    expect(options?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    })
    const providerBody = JSON.parse(String(options?.body))
    expect(providerBody).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 1200,
      temperature: 0.2,
    })
    expect(providerBody.messages.at(-1)).toEqual({ role: 'user', content: '为什么标签很重要？' })
    expect(JSON.stringify(providerBody.messages)).toContain('[S1]')

    const events = eventsFrom(response.text)
    expect(events.map(({ event }) => event)).toEqual(['start', 'sources', 'delta', 'delta', 'done'])
    expect(events[0].data).toEqual({ turnId: 'turn-test-1' })
    expect(events[1].data).toEqual({ sources: validBody().context.sources })
    expect(events[4].data).toEqual({
      usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
    })
    expect(response.text).not.toContain(API_KEY)
  })

  it.each([401, 429, 500])('maps upstream HTTP %s to a safe internal error event', async (status) => {
    const providerBody = `provider-private-${status}-${API_KEY}`
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(providerBody, { status }))

    const response = await request(appWith(fetchImpl)).post('/api/agent/book-chat').send(validBody())

    expect(response.status).toBe(200)
    const events = eventsFrom(response.text)
    expect(events.map(({ event }) => event)).toEqual(['start', 'sources', 'error'])
    expect(events.at(-1)?.data).toEqual({
      code: 'upstream_unavailable',
      message: '学习助手生成失败，请稍后重试。',
    })
    expect(response.text).not.toContain(providerBody)
    expect(response.text).not.toContain(API_KEY)
  })

  it('maps a malformed provider stream to a safe error event', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstreamStream([
      `data: {provider-private-${API_KEY}}\n\n`,
    ]))

    const response = await request(appWith(fetchImpl)).post('/api/agent/book-chat').send(validBody())

    const events = eventsFrom(response.text)
    expect(events.map(({ event }) => event)).toEqual(['start', 'sources', 'error'])
    expect(events.at(-1)?.data).toEqual({
      code: 'invalid_upstream_stream',
      message: '学习助手生成失败，请稍后重试。',
    })
    expect(response.text).not.toContain(API_KEY)
  })

  it('returns a safe SSE error and cleans up when turn ID creation fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const response = await request(appWith(fetchImpl, API_KEY, () => {
      throw new Error(`turn-id-private-${API_KEY}`)
    }))
      .post('/api/agent/book-chat')
      .send(validBody())
      .timeout({ response: 300 })

    expect(response.status).toBe(200)
    expect(eventsFrom(response.text)).toEqual([{
      event: 'error',
      data: { code: 'upstream_unavailable', message: '学习助手生成失败，请稍后重试。' },
    }])
    expect(response.text).not.toContain(API_KEY)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('aborts a pending upstream request after the 60-second timeout', async () => {
    const realSetTimeout = globalThis.setTimeout
    let fireRouteTimeout: (() => void) | undefined
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback, delay, ...args) => {
      if (delay === 60_000) {
        fireRouteTimeout = () => callback(...args)
        const timer = realSetTimeout(() => undefined, 3_600_000)
        timer.unref()
        return timer
      }
      return realSetTimeout(callback, delay, ...args)
    }) as typeof setTimeout)
    let observeSignal: ((signal: AbortSignal) => void) | undefined
    const signalSeen = new Promise<AbortSignal>((resolve) => { observeSignal = resolve })
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return reject(new Error('missing signal'))
      observeSignal?.(signal)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))

    try {
      const responsePromise = Promise.resolve(
        request(appWith(fetchImpl)).post('/api/agent/book-chat').send(validBody()),
      )
      const upstreamSignal = await signalSeen
      expect(fireRouteTimeout).toBeTypeOf('function')
      fireRouteTimeout?.()

      const response = await responsePromise
      expect(upstreamSignal.aborted).toBe(true)
      const events = eventsFrom(response.text)
      expect(events.map(({ event }) => event)).toEqual(['start', 'sources', 'error'])
      expect(events.at(-1)?.data).toEqual({
        code: 'upstream_timeout',
        message: '学习助手生成失败，请稍后重试。',
      })
    } finally {
      timeoutSpy.mockRestore()
    }
  })

  it('aborts the upstream request when the response connection closes', async () => {
    let observeSignal: ((signal: AbortSignal) => void) | undefined
    const signalSeen = new Promise<AbortSignal>((resolve) => { observeSignal = resolve })
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return reject(new Error('missing signal'))
      observeSignal?.(signal)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const server = http.createServer(appWith(fetchImpl))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    try {
      const responseClosed = new Promise<void>((resolve, reject) => {
        const clientRequest = http.request({
          host: '127.0.0.1',
          port,
          path: '/api/agent/book-chat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (clientResponse) => {
          clientResponse.once('data', () => clientResponse.destroy())
          clientResponse.once('close', resolve)
        })
        clientRequest.once('error', (error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error)
        })
        clientRequest.end(JSON.stringify(validBody()))
      })

      const upstreamSignal = await signalSeen
      await responseClosed
      await vi.waitFor(() => expect(upstreamSignal.aborted).toBe(true))
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
