export type OpenAIStreamUsage = Record<string, unknown>

export type OpenAIStreamFrame =
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: OpenAIStreamUsage }
  | { type: 'done' }

export type OpenAIStreamParseErrorCode =
  | 'invalid_upstream_stream'
  | 'incomplete_upstream_stream'

export class OpenAIStreamParseError extends Error {
  readonly code: OpenAIStreamParseErrorCode

  constructor(code: OpenAIStreamParseErrorCode) {
    super(code)
    this.name = 'OpenAIStreamParseError'
    this.code = code
  }
}

type FrameHandler = (frame: OpenAIStreamFrame) => void | Promise<void>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function consumeDataLine(line: string, onFrame: FrameHandler): Promise<boolean> {
  const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line
  if (!normalizedLine.startsWith('data:')) return false

  const data = normalizedLine.slice('data:'.length).trimStart()
  if (!data) return false
  if (data.trim() === '[DONE]') {
    await onFrame({ type: 'done' })
    return true
  }

  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch {
    throw new OpenAIStreamParseError('invalid_upstream_stream')
  }
  if (!isRecord(payload)) return false

  const choices = payload.choices
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!isRecord(choice) || !isRecord(choice.delta)) continue
      if (typeof choice.delta.content === 'string' && choice.delta.content.length > 0) {
        await onFrame({ type: 'delta', text: choice.delta.content })
      }
    }
  }
  if (isRecord(payload.usage)) {
    await onFrame({ type: 'usage', usage: payload.usage })
  }
  return false
}

export async function parseOpenAIStream(
  stream: ReadableStream<Uint8Array>,
  onFrame: FrameHandler,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let complete = false

  async function consumeBufferedLines(flush: boolean): Promise<void> {
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (await consumeDataLine(line, onFrame)) {
        complete = true
        return
      }
      newlineIndex = buffer.indexOf('\n')
    }
    if (flush && buffer.length > 0) {
      complete = await consumeDataLine(buffer, onFrame)
      buffer = ''
    }
  }

  try {
    while (!complete) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        await consumeBufferedLines(true)
        break
      }
      buffer += decoder.decode(value, { stream: true })
      await consumeBufferedLines(false)
    }
  } finally {
    reader.releaseLock()
  }

  if (!complete) {
    throw new OpenAIStreamParseError('incomplete_upstream_stream')
  }
}
