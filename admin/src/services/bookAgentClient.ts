import type { BookAgentContext, BookAgentSource } from '../types/bookAgent'
import {
  createSseFrameParserState,
  parseSseFrames,
  type SseFrameEvent,
  type SseFrameParserState,
} from './sseFrames'

export interface BookAgentClientHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BookAgentClientRequest {
  question: string
  history: BookAgentClientHistoryMessage[]
  context: BookAgentContext | null
}

export type BookAgentClientEvent =
  | { type: 'start'; turnId: string }
  | { type: 'sources'; sources: BookAgentSource[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; usage?: Record<string, number> }
  | { type: 'error'; code: string; message: string }

export interface StreamBookAgentOptions {
  signal?: AbortSignal
  onEvent: (event: BookAgentClientEvent) => void
}

export class BookAgentClientError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'BookAgentClientError'
    this.code = code
  }
}

const REQUEST_URL = '/api/agent/book-chat'
const SAFE_HTTP_MESSAGE = '学习助手暂时不可用，请稍后重试。'
const INVALID_STREAM_MESSAGE = '学习助手返回了无法识别的内容，请重试。'
const INCOMPLETE_STREAM_MESSAGE = '学习助手连接意外中断，请重试。'
const RECOGNIZED_EVENTS = new Set(['start', 'sources', 'delta', 'done', 'error'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validSource(value: unknown): value is BookAgentSource {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && /^S[1-9]\d*$/u.test(value.id)
    && typeof value.sourceId === 'string'
    && typeof value.fileName === 'string'
    && typeof value.pageRange === 'string'
    && typeof value.excerpt === 'string'
    && typeof value.chapterId === 'string'
    && typeof value.blockId === 'string'
}

function parseUsage(value: unknown): Record<string, number> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== 'number')) {
    throw new BookAgentClientError('invalid_stream', INVALID_STREAM_MESSAGE)
  }
  return value as Record<string, number>
}

function parseEvent(type: string, data: string): BookAgentClientEvent | null {
  if (!RECOGNIZED_EVENTS.has(type)) return null

  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    throw new BookAgentClientError('invalid_stream', INVALID_STREAM_MESSAGE)
  }
  if (!isRecord(value)) throw new BookAgentClientError('invalid_stream', INVALID_STREAM_MESSAGE)

  if (type === 'start' && typeof value.turnId === 'string' && value.turnId) {
    return { type, turnId: value.turnId }
  }
  if (type === 'sources' && Array.isArray(value.sources) && value.sources.every(validSource)) {
    return { type, sources: value.sources }
  }
  if (type === 'delta' && typeof value.text === 'string') {
    return { type, text: value.text }
  }
  if (type === 'done') {
    const usage = parseUsage(value.usage)
    return usage === undefined ? { type } : { type, usage }
  }
  if (type === 'error' && typeof value.code === 'string' && typeof value.message === 'string') {
    return { type, code: value.code, message: value.message }
  }
  throw new BookAgentClientError('invalid_stream', INVALID_STREAM_MESSAGE)
}

function parseFrame(frame: SseFrameEvent): { event: BookAgentClientEvent | null; terminal: boolean } {
  if (!RECOGNIZED_EVENTS.has(frame.event)) return { event: null, terminal: false }
  if (frame.data === '') throw new BookAgentClientError('invalid_stream', INVALID_STREAM_MESSAGE)
  const event = parseEvent(frame.event, frame.data)
  return { event, terminal: event?.type === 'done' || event?.type === 'error' }
}

async function readHttpError(response: Response): Promise<BookAgentClientError> {
  let code = `http_${response.status}`
  try {
    const value: unknown = await response.json()
    if (isRecord(value) && typeof value.error === 'string' && /^[a-z][a-z0-9_]*$/u.test(value.error)) {
      code = value.error
    }
  } catch {
    // Ignore provider/proxy response bodies and expose only a stable client message.
  }
  return new BookAgentClientError(code, SAFE_HTTP_MESSAGE)
}

export async function streamBookAgent(
  request: BookAgentClientRequest,
  options: StreamBookAgentOptions,
): Promise<void> {
  const response = await fetch(REQUEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options.signal,
  })
  if (!response.ok) throw await readHttpError(response)
  if (!response.body) throw new BookAgentClientError('invalid_stream', INVALID_STREAM_MESSAGE)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let parserState: SseFrameParserState = createSseFrameParserState()
  let terminal = false
  let reachedNaturalEof = false
  let shouldCancel = false

  const dispatchCompleteFrames = (chunk: string, flush = false): void => {
    const parsed = parseSseFrames(chunk, parserState, flush)
    parserState = parsed.state
    for (const frame of parsed.events) {
      const result = parseFrame(frame)
      if (result.event) options.onEvent(result.event)
      terminal = result.terminal
      if (terminal) return
    }
  }

  try {
    while (!terminal) {
      const { value, done } = await reader.read()
      if (done) {
        reachedNaturalEof = true
        break
      }
      dispatchCompleteFrames(decoder.decode(value, { stream: true }))
    }

    if (terminal && !reachedNaturalEof) shouldCancel = true
    if (!terminal) {
      dispatchCompleteFrames(decoder.decode(), true)
      if (terminal && !reachedNaturalEof) shouldCancel = true
      if (!terminal) throw new BookAgentClientError('incomplete_stream', INCOMPLETE_STREAM_MESSAGE)
    }
  } catch (error) {
    if (!reachedNaturalEof) shouldCancel = true
    throw error
  } finally {
    if (shouldCancel) {
      try {
        await reader.cancel()
      } catch {
        // Cancellation cleanup cannot replace a terminal result or primary parse/callback error.
      }
    }
    try {
      reader.releaseLock()
    } catch {
      // A cleanup failure cannot change the externally observed stream result.
    }
  }
}
