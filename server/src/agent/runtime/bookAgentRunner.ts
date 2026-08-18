import type { NormalizedBookAgentRequest } from '../bookAgentContract.js'
import { buildBookAgentMessages } from '../bookAgentPrompt.js'
import {
  OpenAIStreamParseError,
  parseOpenAIStream,
  type OpenAIStreamUsage,
} from '../openAIStream.js'

export interface BookAgentEnvironment {
  LLM_API_KEY?: string
  LLM_BASE_URL?: string
  LLM_MODEL?: string
}

export interface BookAgentLogEvent {
  category:
    | 'upstream_http_error'
    | 'upstream_fetch_error'
    | 'upstream_timeout'
    | 'upstream_stream_error'
    | 'internal_route_error'
  status?: number
  name?: string
  requestBytes?: number
  causeCode?: string
  provider?: { code?: string; type?: string; param?: string }
}

export type BookAgentLogger = (event: BookAgentLogEvent) => void

export interface BookAgentRunCallbacks {
  onDelta(text: string): void | Promise<void>
}

export interface BookAgentRunResult {
  usage?: OpenAIStreamUsage
}

export interface BookAgentRunner {
  isConfigured(): boolean
  run(
    request: NormalizedBookAgentRequest,
    callbacks: BookAgentRunCallbacks,
    options?: { signal?: AbortSignal },
  ): Promise<BookAgentRunResult>
  reportInternalError(error: unknown): void
}

interface BookAgentRunnerDependencies {
  fetchImpl?: typeof fetch
  env?: BookAgentEnvironment
  logger?: BookAgentLogger
  buildMessages?: typeof buildBookAgentMessages
}

const FAILURE_MESSAGE = '学习助手生成失败，请稍后重试。'
const MAX_PROVIDER_ERROR_BYTES = 8_192
const SAFE_PROVIDER_CODES = new Set(['invalid_api_key', 'rate_limit', 'server_error'])
const SAFE_PROVIDER_TYPES = new Set([
  'authentication_error', 'rate_limit_error', 'service_unavailable',
])
const SAFE_PROVIDER_PARAMS = new Set(['authorization', 'requests', 'upstream'])
const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'TimeoutError', 'OpenAIStreamParseError'])
const SAFE_NETWORK_CAUSE_CODES = new Set([
  'ECONNRESET', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT',
  'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED',
])

class UpstreamHttpError extends Error {}
class ExternalAbortError extends Error {}
class InternalCallbackError extends Error {}

export class BookAgentRunnerError extends Error {
  readonly code: string
  readonly safeMessage: string

  constructor(code: string, safeMessage = FAILURE_MESSAGE) {
    super(code)
    this.name = 'BookAgentRunnerError'
    this.code = code
    this.safeMessage = safeMessage
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function closedIdentifier(value: unknown, allowlist: ReadonlySet<string>): string | undefined {
  if (typeof value !== 'string') return undefined
  return allowlist.has(value) ? value : undefined
}

function safeErrorName(error: unknown): string | undefined {
  return error instanceof Error ? closedIdentifier(error.name, SAFE_ERROR_NAMES) : undefined
}

function safeCauseCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  try {
    const cause = (error as Error & { cause?: unknown }).cause
    if (!(cause instanceof Error)) return undefined
    return closedIdentifier((cause as Error & { code?: unknown }).code, SAFE_NETWORK_CAUSE_CODES)
  } catch {
    return undefined
  }
}

function exactUtf8ByteLength(value: string): number {
  const encoded = new TextEncoder().encode(value)
  const byteLength = encoded.byteLength
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > encoded.buffer.byteLength) {
    throw new Error('invalid_request_byte_length')
  }
  return byteLength
}

function emitLog(logger: BookAgentLogger, event: BookAgentLogEvent): void {
  try {
    logger(event)
  } catch {
    // Observability must never alter request execution.
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return
  try {
    await body.cancel()
  } catch {
    // Provider cleanup is deliberately not observable.
  }
}

async function readSafeProviderFields(
  response: globalThis.Response,
  signal: AbortSignal,
): Promise<BookAgentLogEvent['provider'] | undefined> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    await cancelBody(response.body)
    return undefined
  }
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_ERROR_BYTES) {
    await cancelBody(response.body)
    return undefined
  }
  if (!response.body) return undefined

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let byteCount = 0
  let text = ''
  let exceeded = false
  let cancellation: Promise<void> | undefined
  const cancelReader = () => {
    cancellation ??= reader.cancel().catch(() => undefined)
  }
  const onAbort = () => cancelReader()
  if (signal.aborted) cancelReader()
  else signal.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      byteCount += part.value.byteLength
      if (byteCount > MAX_PROVIDER_ERROR_BYTES) {
        exceeded = true
        cancelReader()
        break
      }
      text += decoder.decode(part.value, { stream: true })
    }
    if (exceeded) return undefined
    text += decoder.decode()
  } catch {
    return undefined
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (cancellation) await cancellation
    reader.releaseLock()
  }
  if (signal.aborted) return undefined

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined
  const provider = {
    code: closedIdentifier(payload.error.code, SAFE_PROVIDER_CODES),
    type: closedIdentifier(payload.error.type, SAFE_PROVIDER_TYPES),
    param: closedIdentifier(payload.error.param, SAFE_PROVIDER_PARAMS),
  }
  const retained = Object.fromEntries(
    Object.entries(provider).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  return Object.keys(retained).length > 0 ? retained : undefined
}

export function createBookAgentRunner(
  dependencies: BookAgentRunnerDependencies = {},
): BookAgentRunner {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  const env = dependencies.env ?? process.env
  const buildMessages = dependencies.buildMessages ?? buildBookAgentMessages
  const logger = dependencies.logger ?? ((event: BookAgentLogEvent) => {
    console.warn(`[book-agent] ${JSON.stringify(event)}`)
  })

  return {
    isConfigured() {
      return (env.LLM_API_KEY?.trim() ?? '').length > 0
    },

    reportInternalError(error) {
      const name = safeErrorName(error)
      emitLog(logger, {
        category: 'internal_route_error',
        ...(name === undefined ? {} : { name }),
      })
    },

    async run(request, callbacks, options = {}) {
      const apiKey = env.LLM_API_KEY?.trim() ?? ''
      if (!apiKey) throw new BookAgentRunnerError('agent_not_configured')
      const abortController = new AbortController()
      let timedOut = false
      let externallyAborted = false
      let phase: 'setup' | 'fetch' | 'stream' = 'setup'
      let diagnosticEmitted = false
      let requestBytes: number | undefined
      const emitDiagnostic = (event: BookAgentLogEvent) => {
        if (diagnosticEmitted) return
        diagnosticEmitted = true
        emitLog(logger, {
          ...event,
          ...(requestBytes === undefined ? {} : { requestBytes }),
        })
      }
      const onExternalAbort = () => {
        externallyAborted = true
        abortController.abort(options.signal?.reason ?? new ExternalAbortError())
      }
      if (options.signal?.aborted) onExternalAbort()
      else options.signal?.addEventListener('abort', onExternalAbort, { once: true })
      const timeout = setTimeout(() => {
        timedOut = true
        abortController.abort(new DOMException('Upstream timed out', 'TimeoutError'))
      }, 60_000)
      timeout.unref()

      try {
        const baseUrl = (env.LLM_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/$/u, '')
        const providerBody = JSON.stringify({
          model: env.LLM_MODEL?.trim() || 'deepseek-v4-flash',
          messages: buildMessages(request),
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: 1200,
          temperature: 0.2,
        })
        requestBytes = exactUtf8ByteLength(providerBody)
        phase = 'fetch'
        const upstream = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: providerBody,
          signal: abortController.signal,
        })
        if (!upstream.ok) {
          const provider = await readSafeProviderFields(upstream, abortController.signal)
          if (abortController.signal.aborted) {
            throw abortController.signal.reason ?? new ExternalAbortError()
          }
          emitDiagnostic({
            category: 'upstream_http_error',
            status: upstream.status,
            ...(provider === undefined ? {} : { provider }),
          })
          throw new UpstreamHttpError()
        }
        phase = 'stream'
        if (!upstream.body) throw new OpenAIStreamParseError('invalid_upstream_stream')

        let usage: OpenAIStreamUsage | undefined
        await parseOpenAIStream(upstream.body, async (frame) => {
          if (frame.type === 'delta') {
            try {
              await callbacks.onDelta(frame.text)
            } catch {
              abortController.abort(new DOMException('Internal callback failed', 'AbortError'))
              throw new InternalCallbackError()
            }
          }
          if (frame.type === 'usage') usage = frame.usage
        })
        return usage === undefined ? {} : { usage }
      } catch (error) {
        if (externallyAborted) throw new ExternalAbortError()
        if (timedOut) {
          const name = safeErrorName(error)
          const causeCode = safeCauseCode(error)
          emitDiagnostic({
            category: 'upstream_timeout',
            ...(name === undefined ? {} : { name }),
            ...(causeCode === undefined ? {} : { causeCode }),
          })
          throw new BookAgentRunnerError('upstream_timeout')
        }
        if (error instanceof InternalCallbackError) {
          emitDiagnostic({ category: 'internal_route_error' })
          throw new BookAgentRunnerError('internal_runtime_error')
        }
        if (!(error instanceof UpstreamHttpError)) {
          const category = phase === 'fetch'
            ? 'upstream_fetch_error'
            : phase === 'stream'
              ? 'upstream_stream_error'
              : 'internal_route_error'
          const name = safeErrorName(error)
          const causeCode = safeCauseCode(error)
          emitDiagnostic({
            category,
            ...(name === undefined ? {} : { name }),
            ...(causeCode === undefined ? {} : { causeCode }),
          })
        }
        const code = error instanceof OpenAIStreamParseError
          ? error.code
          : 'upstream_unavailable'
        throw new BookAgentRunnerError(code)
      } finally {
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', onExternalAbort)
      }
    },
  }
}
