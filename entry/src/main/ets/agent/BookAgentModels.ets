export type BookAgentEventType = 'start' | 'sources' | 'delta' | 'done' | 'error'

export class BookAgentEvent {
  type: BookAgentEventType
  text: string
  code: string

  constructor(type: BookAgentEventType, text: string = '', code: string = '') {
    this.type = type
    this.text = text
    this.code = code
  }
}
