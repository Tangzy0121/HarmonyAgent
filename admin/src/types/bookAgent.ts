import type { AgentContextScope } from './learningBook'

export interface BookAgentSource {
  id: `S${number}`
  sourceId: string
  fileName: string
  pageRange: string
  excerpt: string
  chapterId: string
  blockId: string
}

export interface BookAgentBlock {
  id: string
  type: string
  title: string
  content: string
  sourceIds: string[]
  userAuthored: boolean
}

export interface BookAgentChapter {
  id: string
  title: string
  objective: string
  blocks: BookAgentBlock[]
}

export interface BookAgentContext {
  bookId: string
  title: string
  scope: AgentContextScope
  label: string
  focusBlockId?: string
  chapters: BookAgentChapter[]
  sources: BookAgentSource[]
  warnings: string[]
}

export interface BookAgentRequest {
  bookId: string
  chapterId: string
  scope?: AgentContextScope
  message: string
  focusBlockId?: string
}

export type BookAgentStreamEvent =
  | { type: 'start'; sessionId: string; messageId: string }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: BookAgentSource[] }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string }

export interface BookAgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'complete' | 'streaming' | 'error' | 'cancelled'
  createdAt: string
  sources?: BookAgentSource[]
}

export interface BookAgentSession {
  id: string
  bookId: string
  chapterId: string
  scope: AgentContextScope
  messages: BookAgentMessage[]
}
