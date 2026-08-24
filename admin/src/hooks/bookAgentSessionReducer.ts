import type { BookAgentMessage, BookAgentSource } from '../types/bookAgent'
import type { AgentContextScope } from '../types/learningBook'

export type BookAgentSessionStatus = 'idle' | 'streaming' | 'error' | 'cancelled'

export interface BookAgentSessionState {
  id: string
  bookId: string
  chapterId: string
  scope: AgentContextScope
  messages: BookAgentMessage[]
  status: BookAgentSessionStatus
  activeRequestId?: string
  turnId?: string
  errorMessage?: string
}

export interface BookAgentSessionsState {
  sessions: Record<string, BookAgentSessionState>
}

interface RequestAction {
  sessionKey: string
  requestId: string
}

export type BookAgentSessionAction =
  | (RequestAction & {
    type: 'submit'
    bookId: string
    chapterId: string
    scope: AgentContextScope
    question: string
    userMessageId: string
    assistantMessageId: string
    createdAt: string
  })
  | (RequestAction & { type: 'retry'; assistantMessageId: string; createdAt: string })
  | (RequestAction & { type: 'start'; turnId: string })
  | (RequestAction & { type: 'delta'; text: string })
  | (RequestAction & { type: 'sources'; sources: BookAgentSource[] })
  | (RequestAction & { type: 'done' })
  | (RequestAction & { type: 'error'; message: string })
  | (RequestAction & { type: 'cancel' })
  | { type: 'newConversation'; sessionKey: string }

export const initialBookAgentSessionsState: BookAgentSessionsState = { sessions: {} }

export function bookAgentSessionKey(
  bookId: string,
  chapterId: string,
  scope: AgentContextScope,
): string {
  return scope === 'book' ? `${bookId}:book:all` : `${bookId}:chapter:${chapterId}`
}

function updateActiveAssistant(
  session: BookAgentSessionState,
  update: (message: BookAgentMessage) => BookAgentMessage,
): BookAgentSessionState {
  let updated = false
  const messages = session.messages.map((message, index) => {
    if (!updated && index === session.messages.length - 1 && message.role === 'assistant') {
      updated = true
      return update(message)
    }
    return message
  })
  return updated ? { ...session, messages } : session
}

function withSession(
  state: BookAgentSessionsState,
  sessionKey: string,
  update: (session: BookAgentSessionState) => BookAgentSessionState,
): BookAgentSessionsState {
  const session = state.sessions[sessionKey]
  if (!session) return state
  const next = update(session)
  if (next === session) return state
  return { ...state, sessions: { ...state.sessions, [sessionKey]: next } }
}

function requestMatches(session: BookAgentSessionState, requestId: string): boolean {
  return session.activeRequestId === requestId && session.status === 'streaming'
}

export function bookAgentSessionReducer(
  state: BookAgentSessionsState,
  action: BookAgentSessionAction,
): BookAgentSessionsState {
  if (action.type === 'newConversation') {
    if (!state.sessions[action.sessionKey]) return state
    const sessions = { ...state.sessions }
    delete sessions[action.sessionKey]
    return { ...state, sessions }
  }

  if (action.type === 'submit') {
    const current = state.sessions[action.sessionKey]
    const userMessage: BookAgentMessage = {
      id: action.userMessageId,
      role: 'user',
      content: action.question,
      status: 'complete',
      createdAt: action.createdAt,
    }
    const assistantMessage: BookAgentMessage = {
      id: action.assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: action.createdAt,
    }
    const session: BookAgentSessionState = {
      id: action.sessionKey,
      bookId: action.bookId,
      chapterId: action.chapterId,
      scope: action.scope,
      messages: [...(current?.messages ?? []), userMessage, assistantMessage],
      status: 'streaming',
      activeRequestId: action.requestId,
    }
    return { ...state, sessions: { ...state.sessions, [action.sessionKey]: session } }
  }

  if (action.type === 'retry') {
    return withSession(state, action.sessionKey, (session) => {
      let lastUserIndex = -1
      for (let index = session.messages.length - 1; index >= 0; index -= 1) {
        if (session.messages[index].role === 'user') {
          lastUserIndex = index
          break
        }
      }
      if (lastUserIndex < 0) return session
      const messages = session.messages.slice(0, lastUserIndex + 1)
      messages.push({
        id: action.assistantMessageId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: action.createdAt,
      })
      return {
        ...session,
        messages,
        status: 'streaming',
        activeRequestId: action.requestId,
        turnId: undefined,
        errorMessage: undefined,
      }
    })
  }

  return withSession(state, action.sessionKey, (session) => {
    if (!requestMatches(session, action.requestId)) return session
    if (action.type === 'start') return { ...session, turnId: action.turnId }
    if (action.type === 'delta') {
      return updateActiveAssistant(session, (message) => ({
        ...message,
        content: `${message.content}${action.text}`,
      }))
    }
    if (action.type === 'sources') {
      return updateActiveAssistant(session, (message) => ({ ...message, sources: action.sources }))
    }
    if (action.type === 'done') {
      const completed = updateActiveAssistant(session, (message) => ({ ...message, status: 'complete' }))
      return { ...completed, status: 'idle', activeRequestId: undefined }
    }
    if (action.type === 'error') {
      const failed = updateActiveAssistant(session, (message) => ({ ...message, status: 'error' }))
      return {
        ...failed,
        status: 'error',
        activeRequestId: undefined,
        errorMessage: action.message,
      }
    }
    const cancelled = updateActiveAssistant(session, (message) => ({ ...message, status: 'cancelled' }))
    return { ...cancelled, status: 'cancelled', activeRequestId: undefined }
  })
}
