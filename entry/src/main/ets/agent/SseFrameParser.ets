export class SseFrame {
  type: string
  data: string

  constructor(type: string, data: string) {
    this.type = type
    this.data = data
  }
}

function isKnownEvent(type: string): boolean {
  return type === 'start' || type === 'sources' || type === 'delta' ||
    type === 'done' || type === 'error' || type === 'turn_started' ||
    type === 'activity' || type === 'content_delta' || type === 'citation' ||
    type === 'user_question' || type === 'evidence_recorded' ||
    type === 'turn_completed' || type === 'turn_failed'
}

export class SseFrameParser {
  private buffer: string = ''
  private terminal: boolean = false
  private forwardUnknown: boolean

  constructor(forwardUnknown: boolean = false) {
    this.forwardUnknown = forwardUnknown
  }

  push(chunk: string, flush: boolean): Array<SseFrame> {
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, '\n')
    const frames: Array<SseFrame> = []
    let separator: number = this.buffer.indexOf('\n\n')
    while (separator >= 0) {
      const block: string = this.buffer.substring(0, separator)
      this.buffer = this.buffer.substring(separator + 2)
      const frame: SseFrame | null = this.parseBlock(block)
      if (frame !== null) {
        frames.push(frame)
      }
      separator = this.buffer.indexOf('\n\n')
    }
    if (flush && this.buffer.trim().length > 0) {
      const frame: SseFrame | null = this.parseBlock(this.buffer)
      this.buffer = ''
      if (frame !== null) {
        frames.push(frame)
      }
    }
    return frames
  }

  hasTerminal(): boolean {
    return this.terminal
  }

  private parseBlock(block: string): SseFrame | null {
    const lines: Array<string> = block.split('\n')
    let eventType: string = ''
    let data: string = ''
    for (let index: number = 0; index < lines.length; index++) {
      const line: string = lines[index]
      if (line.startsWith('event:')) {
        const rawType: string = line.substring(6)
        eventType = rawType.startsWith(' ') ? rawType.substring(1) : rawType
      } else if (line.startsWith('data:')) {
        const value: string = line.substring(5).trimStart()
        data = data.length === 0 ? value : data + '\n' + value
      }
    }
    if ((!isKnownEvent(eventType) && !this.forwardUnknown) || eventType.length === 0 || data.length === 0) {
      return null
    }
    if (eventType === 'done' || eventType === 'error' || eventType === 'user_question' ||
      eventType === 'turn_completed' || eventType === 'turn_failed') {
      this.terminal = true
    }
    return new SseFrame(eventType, data)
  }
}
