import type { BookChapter } from '../books/bookTypes.js'
import {
  buildFeynmanMessages,
  normalizeFeynmanResult,
  summarizeChapterBlocks,
  type FeynmanResult,
} from '../books/feynmanPrompt.js'
import { extractJsonObject } from '../books/proposalValidation.js'

export interface FeynmanEvaluator {
  evaluate(
    input: { chapter: BookChapter; confirmedText: string },
    options?: { signal?: AbortSignal },
  ): Promise<FeynmanResult>
}

export class FeynmanEvaluatorError extends Error {
  readonly code = 'feynman_evaluation_failed' as const

  constructor() {
    super('feynman_evaluation_failed')
    this.name = 'FeynmanEvaluatorError'
  }
}

interface FeynmanEvaluatorEnvironment {
  LLM_API_KEY?: string
  LLM_BASE_URL?: string
  LLM_MODEL?: string
}

interface ProviderFeynmanEvaluatorDependencies {
  fetchImpl?: typeof fetch
  env?: FeynmanEvaluatorEnvironment
  timeoutMs?: number
  timers?: {
    setTimeout(callback: () => void, delayMs: number): unknown
    clearTimeout(handle: unknown): void
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createProviderFeynmanEvaluator(
  dependencies: ProviderFeynmanEvaluatorDependencies = {},
): FeynmanEvaluator {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  const env = dependencies.env ?? process.env
  const timeoutMs = dependencies.timeoutMs !== undefined &&
    Number.isFinite(dependencies.timeoutMs) && dependencies.timeoutMs > 0
    ? dependencies.timeoutMs
    : 30_000
  const timers = dependencies.timers ?? {
    setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
    clearTimeout: (handle: unknown) => clearTimeout(handle as NodeJS.Timeout),
  }
  return {
    async evaluate({ chapter, confirmedText }, options = {}) {
      const providerController = new AbortController()
      const abortFromCaller = () => providerController.abort(options.signal?.reason)
      if (options.signal?.aborted) abortFromCaller()
      else options.signal?.addEventListener('abort', abortFromCaller, { once: true })
      const timeout = timers.setTimeout(() => {
        providerController.abort(new DOMException('Feynman evaluation timed out', 'TimeoutError'))
      }, timeoutMs)
      try {
        providerController.signal.throwIfAborted()
        const apiKey = env.LLM_API_KEY?.trim()
        if (!apiKey) throw new Error()
        const baseUrl = (env.LLM_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/$/u, '')
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: env.LLM_MODEL?.trim() || 'deepseek-v4-flash',
            messages: buildFeynmanMessages({
              chapterTitle: chapter.title,
              objective: chapter.objective,
              blockSummary: summarizeChapterBlocks(chapter),
              explanation: confirmedText,
            }),
            stream: false,
            response_format: { type: 'json_object' },
            max_completion_tokens: 800,
            temperature: 0.2,
          }),
          signal: providerController.signal,
        })
        if (!response.ok) throw new Error()
        const body: unknown = await response.json()
        const choices = isRecord(body) && Array.isArray(body.choices) ? body.choices : []
        const first = choices[0]
        const message = isRecord(first) && isRecord(first.message) ? first.message : undefined
        if (!message || typeof message.content !== 'string') throw new Error()
        return normalizeFeynmanResult(extractJsonObject(message.content))
      } catch {
        throw new FeynmanEvaluatorError()
      } finally {
        timers.clearTimeout(timeout)
        options.signal?.removeEventListener('abort', abortFromCaller)
      }
    },
  }
}
