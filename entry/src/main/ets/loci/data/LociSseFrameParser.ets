/** Incremental SSE line parser shared by chapter-stream clients. */
export class LociSseFrameParser {
  private eventType: string = ''
  private dataLines: string[] = []
  private dispatch: (event: string, data: string) => void

  constructor(dispatch: (event: string, data: string) => void) {
    this.dispatch = dispatch
  }

  pushLine(raw: string): void {
    const line: string = raw.endsWith('\r') ? raw.substring(0, raw.length - 1) : raw
    if (line.length === 0) {
      this.flushFrame()
      return
    }
    if (line.startsWith(':')) {
      return
    }
    if (line.startsWith('event:')) {
      this.eventType = LociSseFrameParser.fieldValue(line, 6)
      return
    }
    if (line.startsWith('data:')) {
      this.dataLines.push(LociSseFrameParser.fieldValue(line, 5))
    }
  }

  end(): void {
    this.flushFrame()
  }

  private flushFrame(): void {
    if (this.dataLines.length > 0) {
      this.dispatch(this.eventType, this.dataLines.join('\n'))
    }
    this.eventType = ''
    this.dataLines = []
  }

  private static fieldValue(line: string, prefix: number): string {
    let value: string = line.substring(prefix)
    if (value.startsWith(' ')) {
      value = value.substring(1)
    }
    return value
  }
}
