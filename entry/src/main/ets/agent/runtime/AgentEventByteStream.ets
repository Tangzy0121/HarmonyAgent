import { SseFrame, SseFrameParser } from '../SseFrameParser'
import { AgentEventEnvelopeV1, parseAgentEventEnvelope } from './AgentEventParser'
import { AgentEventListener } from './AgentRuntimeGateway'
import { Utf8StreamDecoder } from './Utf8StreamDecoder'

export type AgentStreamFailureListener = () => void

export class AgentEventByteStream {
  private decoder: Utf8StreamDecoder = new Utf8StreamDecoder()
  private parser: SseFrameParser = new SseFrameParser(true)
  private listener: AgentEventListener
  private failureListener: AgentStreamFailureListener
  private failed: boolean = false
  private closed: boolean = false

  constructor(listener: AgentEventListener, failureListener: AgentStreamFailureListener) {
    this.listener = listener
    this.failureListener = failureListener
  }

  private dispatch(frames: Array<SseFrame>): void {
    for (let index: number = 0; index < frames.length; index++) {
      const event: AgentEventEnvelopeV1 | null = parseAgentEventEnvelope(frames[index])
      if (event !== null) this.listener(event)
    }
  }

  private failOnce(): void {
    if (this.failed || this.closed) return
    this.failed = true
    this.failureListener()
  }

  push(data: Uint8Array): void {
    if (this.failed || this.closed) return
    try {
      const chunk: string = this.decoder.decode(data, false)
      this.dispatch(this.parser.push(chunk, false))
    } catch (error) {
      this.failOnce()
    }
  }

  finish(): void {
    if (this.failed || this.closed) return
    try {
      const tail: string = this.decoder.decode(new Uint8Array(), true)
      this.dispatch(this.parser.push(tail, true))
      this.closed = true
    } catch (error) {
      this.failOnce()
    }
  }

  hasFailed(): boolean {
    return this.failed
  }
}
