import { describe, expect, it } from 'vitest'

import type { BookChapter } from '../books/bookTypes.js'
import { createProviderFeynmanEvaluator } from './feynmanEvaluator.js'

const chapter: BookChapter = {
  id: 'ch-1', title: '监督学习', order: 1, objective: '理解标签',
  coreConceptId: 'concept-label', estimatedMinutes: 5, sourceAnchors: [], status: 'ready',
  blocks: [{
    id: 'explanation-1', type: 'explanation', status: 'ready', title: '标签', revision: 1,
    sourceAnchors: [], body: '标签是目标', keyPoint: '标签提供监督信号',
  }],
}

describe('createProviderFeynmanEvaluator', () => {
  it('evaluates confirmed text with the configured server provider and validates its result', async () => {
    let requestBody: Record<string, unknown> | undefined
    const evaluator = createProviderFeynmanEvaluator({
      env: { LLM_API_KEY: 'server-key', LLM_BASE_URL: 'https://llm.example', LLM_MODEL: 'model-1' },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(JSON.stringify({
          choices: [{ message: { content: '{"passed":true,"feedback":"讲清楚了","gap":""}' } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    })

    await expect(evaluator.evaluate({ chapter, confirmedText: '我的私密复述' })).resolves.toEqual({
      passed: true, feedback: '讲清楚了', gap: '',
    })
    expect(requestBody).toMatchObject({ model: 'model-1', stream: false })
  })

  it('returns only a fixed safe error when provider output contains private text', async () => {
    const evaluator = createProviderFeynmanEvaluator({
      env: { LLM_API_KEY: 'server-key' },
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'private model output' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    })

    await expect(evaluator.evaluate({ chapter, confirmedText: 'private user text' }))
      .rejects.toMatchObject({ code: 'feynman_evaluation_failed', message: 'feynman_evaluation_failed' })
  })

  it('aborts a pending provider request through an injected finite timeout without sleeping', async () => {
    let providerSignal: AbortSignal | undefined
    let timeoutCallback: (() => void) | undefined
    let cleared = false
    const evaluator = createProviderFeynmanEvaluator({
      env: { LLM_API_KEY: 'server-key' },
      timeoutMs: 25,
      timers: {
        setTimeout(callback, delayMs) {
          expect(delayMs).toBe(25)
          timeoutCallback = callback
          return 'timeout-handle'
        },
        clearTimeout(handle) {
          expect(handle).toBe('timeout-handle')
          cleared = true
        },
      },
      fetchImpl: async (_url, init) => {
        providerSignal = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          providerSignal?.addEventListener('abort', () => reject(providerSignal?.reason), {
            once: true,
          })
        })
      },
    })

    const pending = evaluator.evaluate({ chapter, confirmedText: '私密复述' })
    timeoutCallback?.()

    await expect(pending).rejects.toMatchObject({ code: 'feynman_evaluation_failed' })
    expect(providerSignal?.aborted).toBe(true)
    expect(cleared).toBe(true)
  })
})
