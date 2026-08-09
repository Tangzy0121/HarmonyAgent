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

async function dispatchDataEvent(dataLines: string[], onFrame: FrameHandler): Promise<boolean> {
  if (dataLines.length === 0) return false
  const data = dataLines.join('\n')
  if (!data.trim()) return false
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

function appendDataField(line: string, dataLines: string[]): void {
  if (!line || line.startsWith(':')) return
  const colonIndex = line.indexOf(':')
  const field = colonIndex < 0 ? line : line.slice(0, colonIndex)
  if (field !== 'data') return
  let value = colonIndex < 0 ? '' : line.slice(colonIndex + 1)
  if (value.startsWith(' ')) value = value.slice(1)
  dataLines.push(value)
}

export async function parseOpenAIStream(
  stream: ReadableStream<Uint8Array>,
  onFrame: FrameHandler,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []
  let complete = false
  let reachedNaturalEof = false
  let shouldCancel = false

  async function consumeBufferedLines(flush: boolean): Promise<void> {
    while (true) {
      let lineEnd = -1
      let terminatorLength = 0
      for (let index = 0; index < buffer.length; index += 1) {
        if (buffer[index] === '\n') {
          lineEnd = index
          terminatorLength = 1
          break
        }
        if (buffer[index] === '\r') {
          if (index === buffer.length - 1 && !flush) break
          lineEnd = index
          terminatorLength = buffer[index + 1] === '\n' ? 2 : 1
          break
        }
      }
      if (lineEnd < 0) break

      const line = buffer.slice(0, lineEnd)
      buffer = buffer.slice(lineEnd + terminatorLength)
      if (line === '') {
        const eventData = dataLines
        dataLines = []
        if (await dispatchDataEvent(eventData, onFrame)) {
          complete = true
          return
        }
      } else {
        appendDataField(line, dataLines)
      }
    }
    if (flush && buffer.length > 0) {
      const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
      appendDataField(line, dataLines)
      buffer = ''
    }
  }

  try {
    while (!complete) {
      const { done, value } = await reader.read()
      if (done) {
        reachedNaturalEof = true
        buffer += decoder.decode()
        await consumeBufferedLines(true)
        break
      }
      buffer += decoder.decode(value, { stream: true })
      await consumeBufferedLines(false)
    }
    if (complete && !reachedNaturalEof) shouldCancel = true
    if (!complete) {
      throw new OpenAIStreamParseError('incomplete_upstream_stream')
    }
  } catch (error) {
    if (!reachedNaturalEof && error instanceof OpenAIStreamParseError) {
      shouldCancel = true
    }
    throw error
  } finally {
    if (shouldCancel) {
      try {
        await reader.cancel()
      } catch {
        // A provider cancellation failure must not replace the primary result or parse error.
      }
    }
    reader.releaseLock()
  }
}
