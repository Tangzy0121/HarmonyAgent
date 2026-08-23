import { BookAgentEvent } from './BookAgentModels'

export interface BookAgentGateway {
  stream(question: string, contextText: string,
    onEvent: (event: BookAgentEvent) => void): Promise<void>
}
