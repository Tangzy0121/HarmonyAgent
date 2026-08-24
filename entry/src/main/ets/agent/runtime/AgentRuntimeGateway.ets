import { DataMode } from '../../network/ServerConfig'
import { AgentEventEnvelopeV1 } from './AgentEventParser'

export type AgentEventListener = (event: AgentEventEnvelopeV1) => void

export class AgentTurnRequest {
  message: string
  surface: string
  bookId: string
  chapterId: string
  blockId: string

  constructor(message: string, surface: string, bookId: string = '', chapterId: string = '',
    blockId: string = '') {
    this.message = message
    this.surface = surface
    this.bookId = bookId
    this.chapterId = chapterId
    this.blockId = blockId
  }
}

export interface AgentRuntimeGateway {
  readonly mode: DataMode
  start(request: AgentTurnRequest, listener: AgentEventListener): Promise<void>
  reconnect(turnId: string, lastEventId: string, listener: AgentEventListener): Promise<void>
  answer(turnId: string, questionId: string, answer: string,
    listener: AgentEventListener): Promise<void>
  cancel(turnId: string): Promise<void>
}
