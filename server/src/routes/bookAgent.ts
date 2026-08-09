import { randomUUID } from 'node:crypto'

import { json, Router, type ErrorRequestHandler, type Response } from 'express'

import {
  BookAgentValidationError,
  normalizeBookAgentRequest,
} from '../agent/bookAgentContract.js'
import { buildBookAgentMessages } from '../agent/bookAgentPrompt.js'
import {
  OpenAIStreamParseError,
  parseOpenAIStream,
  type OpenAIStreamUsage,
} from '../agent/openAIStream.js'

interface BookAgentEnvironment {
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
  provider?: {
    code?: string
    type?: string
    param?: string
  }
}

export type BookAgentLogger = (event: BookAgentLogEvent) => void

interface BookAgentRouterDependencies {
  fetchImpl?: typeof fetch
  env?: BookAgentEnvironment
  createTurnId?: () => string
  logger?: BookAgentLogger
  buildMessages?: typeof buildBookAgentMessages
}

const FAILURE_MESSAGE = '学习助手生成失败，请稍后重试。'
const NOT_CONFIGURED_MESSAGE = '学习助手暂时不可用，请稍后再试。'
const MAX_PROVIDER_ERROR_BYTES = 8_192

// Closed lists intentionally stay small. Unknown provider values add no diagnostic value
// worth the disclosure risk and are omitted in favour of category + HTTP status.
const SAFE_PROVIDER_CODES = new Set(['invalid_api_key', 'rate_limit', 'server_error'])
const SAFE_PROVIDER_TYPES = new Set([
  'authentication_error',
  'rate_limit_error',
  'service_unavailable',
])
const SAFE_PROVIDER_PARAMS = new Set(['authorization', 'requests', 'upstream'])
const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'TimeoutError', 'OpenAIStreamParseError'])
const SAFE_NETWORK_CAUSE_CODES = new Set([
  'ECONNRESET',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
])

class UpstreamHttpError extends Error {
  constructor() {
    super('upstream_unavailable')
    this.name = 'UpstreamHttpError'
  }
}

function writeEvent(res: Response, type: string, data: unknown): void {
  if (res.destroyed || res.writableEnded) return
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
}

function safeStreamError(error: unknown): { code: string; message: string } {
  if (error instanceof OpenAIStreamParseError) {
    return { code: error.code, message: FAILURE_MESSAGE }
  }
  return { code: 'upstream_unavailable', message: FAILURE_MESSAGE }
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
  if (
    !Number.isFinite(byteLength) ||
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > encoded.buffer.byteLength
  ) {
    throw new Error('invalid_request_byte_length')
  }
  return byteLength
}

function emitLog(logger: BookAgentLogger, event: BookAgentLogEvent): void {
  try {
    logger(event)
  } catch {
    // Observability must never alter the request or response lifecycle.
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return
  try {
    await body.cancel()
  } catch {
    // Provider cleanup failures are intentionally not observable to clients or logs.
  }
}

async function readSafeProviderFields(
  response: globalThis.Response,
  signal: AbortSignal,
): Promise<
  BookAgentLogEvent['provider'] | undefined
> {
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
      const { done, value } = await reader.read()
      if (done) break
      byteCount += value.byteLength
      if (byteCount > MAX_PROVIDER_ERROR_BYTES) {
        exceeded = true
        cancelReader()
        break
      }
      text += decoder.decode(value, { stream: true })
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

export function createBookAgentRouter(
  dependencies: BookAgentRouterDependencies = {},
): Router {
  const router = Router()
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  const env = dependencies.env ?? process.env
  const createTurnId = dependencies.createTurnId ?? randomUUID
  const buildMessages = dependencies.buildMessages ?? buildBookAgentMessages
  const logger = dependencies.logger ?? ((event: BookAgentLogEvent) => {
    console.warn(`[book-agent] ${JSON.stringify(event)}`)
  })

  router.use(json({ limit: '10mb' }))

  router.post('/book-chat', async (req, res) => {
    let request
    try {
      request = normalizeBookAgentRequest(req.body)
    } catch (error) {
      const code = error instanceof BookAgentValidationError ? error.code : 'invalid_context'
      res.status(400).json({ error: code })
      return
    }

    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!apiKey) {
      res.status(503).json({ error: 'agent_not_configured', message: NOT_CONFIGURED_MESSAGE })
      return
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const abortController = new AbortController()
    let disconnected = false
    let timedOut = false
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
    const onClientAbort = () => {
      disconnected = true
      abortController.abort(new DOMException('Client disconnected', 'AbortError'))
    }
    const onResponseClose = () => {
      if (!res.writableFinished) onClientAbort()
    }
    req.once('aborted', onClientAbort)
    res.once('close', onResponseClose)
    const timeout = setTimeout(() => {
      timedOut = true
      abortController.abort(new DOMException('Upstream timed out', 'TimeoutError'))
    }, 60_000)
    timeout.unref()

    try {
      writeEvent(res, 'start', { turnId: createTurnId() })
      writeEvent(res, 'sources', { sources: request.context?.sources ?? [] })

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: providerBody,
        signal: abortController.signal,
      })

      if (!upstream.ok) {
        const provider = await readSafeProviderFields(upstream, abortController.signal)
        if (abortController.signal.aborted) {
          throw abortController.signal.reason ?? new DOMException('Upstream aborted', 'AbortError')
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
      await parseOpenAIStream(upstream.body, (frame) => {
        if (frame.type === 'delta') writeEvent(res, 'delta', { text: frame.text })
        if (frame.type === 'usage') usage = frame.usage
      })

      if (!abortController.signal.aborted && !res.destroyed) {
        writeEvent(res, 'done', usage === undefined ? {} : { usage })
        res.end()
      }
    } catch (error) {
      if (!disconnected && !res.destroyed) {
        if (timedOut) {
          const name = safeErrorName(error)
          const causeCode = safeCauseCode(error)
          emitDiagnostic({
            category: 'upstream_timeout',
            ...(name === undefined ? {} : { name }),
            ...(causeCode === undefined ? {} : { causeCode }),
          })
        } else if (!(error instanceof UpstreamHttpError)) {
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
        const payload = timedOut
          ? { code: 'upstream_timeout', message: FAILURE_MESSAGE }
          : safeStreamError(error)
        writeEvent(res, 'error', payload)
        res.end()
      }
    } finally {
      clearTimeout(timeout)
      req.removeListener('aborted', onClientAbort)
      res.removeListener('close', onResponseClose)
    }
  })

  const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    const candidate = error as SyntaxError & { status?: unknown; type?: unknown }
    if (
      error instanceof SyntaxError &&
      candidate.status === 400 &&
      candidate.type === 'entity.parse.failed'
    ) {
      res.status(400).json({ error: 'invalid_json' })
      return
    }
    next(error)
  }
  router.use(jsonErrorHandler)

  return router
}
