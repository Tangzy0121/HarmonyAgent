import { describe, expect, it, vi } from 'vitest'

import type { NormalizedBookAgentRequest } from '../bookAgentContract.js'
import { BookAgentRunnerError, createBookAgentRunner } from './bookAgentRunner.js'

const request: NormalizedBookAgentRequest = {
  question: 'private-user-question',
  history: [],
  context: null,
}

describe('BookAgentRunner internal callback failures', () => {
  it('aborts and cancels the provider stream while reporting a safe internal category', async () => {
    const encoder = new TextEncoder()
    let cancelCount = 0
    let providerSignal: AbortSignal | undefined
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"choices":[{"delta":{"content":"delta"}}]}\n\n',
        ))
      },
      cancel() { cancelCount += 1 },
    })
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      providerSignal = init?.signal as AbortSignal
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })
    const logger = vi.fn()
    const runner = createBookAgentRunner({
      fetchImpl,
      env: { LLM_API_KEY: 'server-secret-key' },
      logger,
      buildMessages: () => [],
    })

    await expect(runner.run(request, {
      onDelta: () => { throw new Error('callback-secret-and-user-content') },
    })).rejects.toMatchObject<Partial<BookAgentRunnerError>>({
      code: 'internal_runtime_error',
    })

    expect(providerSignal?.aborted).toBe(true)
    expect(cancelCount).toBe(1)
    expect(logger).toHaveBeenCalledTimes(1)
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({
      category: 'internal_route_error',
    }))
    expect(JSON.stringify(logger.mock.calls)).not.toContain('callback-secret')
    expect(JSON.stringify(logger.mock.calls)).not.toContain('private-user-question')
    expect(JSON.stringify(logger.mock.calls)).not.toContain('server-secret-key')
  })
})
