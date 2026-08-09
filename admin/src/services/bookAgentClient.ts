import type { BookAgentContext, BookAgentSource } from '../types/bookAgent'

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

function parseFrame(frame: string): { event: BookAgentClientEvent | null; terminal: boolean } {
  let type = 'message'
  const data: string[] = []
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    let value = separator < 0 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') type = value
    if (field === 'data') data.push(value)
  }
  if (!RECOGNIZED_EVENTS.has(type)) return { event: null, terminal: false }
  if (data.length === 0) throw new BookAgentClientError('invalid_stream', INVALID_STREAM_MESSAGE)
  const event = parseEvent(type, data.join('\n'))
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

function nextFrame(buffer: string): { frame: string; rest: string } | null {
  const match = /\n\n/u.exec(buffer)
  if (!match) return null
  return { frame: buffer.slice(0, match.index), rest: buffer.slice(match.index + match[0].length) }
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
  let buffer = ''
  let terminal = false
  let pendingCarriageReturn = false

  const normalizeLineEndings = (text: string, flush = false): string => {
    let normalized = ''
    let index = 0
    if (pendingCarriageReturn) {
      normalized += '\n'
      if (text.startsWith('\n')) index = 1
      pendingCarriageReturn = false
    }
    while (index < text.length) {
      const character = text[index]
      if (character === '\r') {
        if (index === text.length - 1 && !flush) {
          pendingCarriageReturn = true
          break
        }
        normalized += '\n'
        if (text[index + 1] === '\n') index += 1
      } else {
        normalized += character
      }
      index += 1
    }
    if (flush && pendingCarriageReturn) {
      normalized += '\n'
      pendingCarriageReturn = false
    }
    return normalized
  }

  const dispatchCompleteFrames = (): void => {
    let extracted = nextFrame(buffer)
    while (extracted) {
      buffer = extracted.rest
      const parsed = parseFrame(extracted.frame)
      if (parsed.event) options.onEvent(parsed.event)
      terminal = parsed.terminal
      if (terminal) return
      extracted = nextFrame(buffer)
    }
  }

  while (!terminal) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += normalizeLineEndings(decoder.decode(value, { stream: true }))
    dispatchCompleteFrames()
  }

  if (!terminal) {
    buffer += normalizeLineEndings(decoder.decode(), true)
    dispatchCompleteFrames()
    if (!terminal) throw new BookAgentClientError('incomplete_stream', INCOMPLETE_STREAM_MESSAGE)
  }
}
