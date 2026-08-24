// SSE 帧解析共享模块：从 bookAgentClient 抽取，供 book-chat 与章节生成流复用。
// 只负责 CRLF 归一、跨 chunk 缓冲与 \n\n 分帧；事件语义（类型白名单、字段校验）
// 由调用方在拿到的 { event, data } 上自行解释。

export interface SseFrameEvent {
  event: string
  data: string
}

export interface SseFrameParserState {
  buffer: string
  pendingCarriageReturn: boolean
}

export function createSseFrameParserState(): SseFrameParserState {
  return { buffer: '', pendingCarriageReturn: false }
}

function nextFrame(buffer: string): { frame: string; rest: string } | null {
  const match = /\n\n/u.exec(buffer)
  if (!match) return null
  return { frame: buffer.slice(0, match.index), rest: buffer.slice(match.index + match[0].length) }
}

function parseFrameFields(frame: string): SseFrameEvent {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    let value = separator < 0 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    if (field === 'data') data.push(value)
  }
  return { event, data: data.join('\n') }
}

/**
 * 喂入一段已解码文本，返回本次切出的完整帧与新的解析状态。
 * flush 用于流自然结束时把悬挂的 \r 归一为 \n。
 */
export function parseSseFrames(
  chunk: string,
  state: SseFrameParserState,
  flush = false,
): { events: SseFrameEvent[]; state: SseFrameParserState } {
  let { buffer, pendingCarriageReturn } = state
  let normalized = ''
  let index = 0
  if (pendingCarriageReturn) {
    normalized += '\n'
    if (chunk.startsWith('\n')) index = 1
    pendingCarriageReturn = false
  }
  while (index < chunk.length) {
    const character = chunk[index]
    if (character === '\r') {
      if (index === chunk.length - 1 && !flush) {
        pendingCarriageReturn = true
        break
      }
      normalized += '\n'
      if (chunk[index + 1] === '\n') index += 1
    } else {
      normalized += character
    }
    index += 1
  }
  if (flush && pendingCarriageReturn) {
    normalized += '\n'
    pendingCarriageReturn = false
  }
  buffer += normalized

  const events: SseFrameEvent[] = []
  let extracted = nextFrame(buffer)
  while (extracted) {
    buffer = extracted.rest
    events.push(parseFrameFields(extracted.frame))
    extracted = nextFrame(buffer)
  }
  return { events, state: { buffer, pendingCarriageReturn } }
}
