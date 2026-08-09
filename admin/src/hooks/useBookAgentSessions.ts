import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'

import { buildBookAgentContext } from '../domain/bookAgentContext'
import {
  BookAgentClientError,
  streamBookAgent,
  type BookAgentClientEvent,
  type BookAgentClientHistoryMessage,
} from '../services/bookAgentClient'
import type { BookAgentMessage } from '../types/bookAgent'
import type { AgentContextScope, LearningBook } from '../types/learningBook'
import {
  bookAgentSessionKey,
  bookAgentSessionReducer,
  initialBookAgentSessionsState,
  type BookAgentSessionAction,
  type BookAgentSessionState,
} from './bookAgentSessionReducer'

interface UseBookAgentSessionsOptions {
  book: LearningBook
  activeChapterId: string
  scope: AgentContextScope
  contextEnabled?: boolean
}

interface ActiveRequest {
  controller: AbortController
  sessionKey: string
  requestId: string
}

export interface UseBookAgentSessionsResult {
  session: BookAgentSessionState
  focusBlockId: string | undefined
  setFocusBlockId: (blockId: string | undefined) => void
  submit: (question: string) => Promise<void>
  stop: () => void
  retry: () => Promise<void>
  newConversation: () => void
}

const FALLBACK_ERROR_MESSAGE = '学习助手生成失败，请稍后重试。'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function clientId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

export function completeBookAgentHistory(
  messages: BookAgentMessage[],
  retriedQuestion?: string,
): BookAgentClientHistoryMessage[] {
  let cutoff = messages.length
  if (retriedQuestion !== undefined) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (
        message.role === 'user'
        && message.status === 'complete'
        && message.content === retriedQuestion
      ) {
        cutoff = index
        break
      }
    }
  }

  const paired: BookAgentClientHistoryMessage[] = []
  for (let index = 0; index + 1 < cutoff; index += 1) {
    const user = messages[index]
    const assistant = messages[index + 1]
    if (
      user.role === 'user'
      && user.status === 'complete'
      && user.content.trim()
      && assistant.role === 'assistant'
      && assistant.status === 'complete'
      && assistant.content.trim()
    ) {
      paired.push(
        { role: 'user', content: user.content },
        { role: 'assistant', content: assistant.content },
      )
      index += 1
    }
  }
  return paired.slice(-6)
}

export function useBookAgentSessions({
  book,
  activeChapterId,
  scope,
  contextEnabled = true,
}: UseBookAgentSessionsOptions): UseBookAgentSessionsResult {
  const [state, reactDispatch] = useReducer(bookAgentSessionReducer, initialBookAgentSessionsState)
  const stateRef = useRef(state)
  const activeRef = useRef<ActiveRequest | null>(null)
  const [focusBySession, setFocusBySession] = useState<Record<string, string | undefined>>({})
  const sessionKey = bookAgentSessionKey(book.id, activeChapterId, scope)
  const committedSessionKeyRef = useRef(sessionKey)

  const dispatch = useCallback((action: BookAgentSessionAction) => {
    stateRef.current = bookAgentSessionReducer(stateRef.current, action)
    reactDispatch(action)
  }, [])

  const cancelActive = useCallback(() => {
    const active = activeRef.current
    if (!active) return
    activeRef.current = null
    active.controller.abort()
    dispatch({
      type: 'cancel',
      sessionKey: active.sessionKey,
      requestId: active.requestId,
    })
  }, [dispatch])

  const runStream = useCallback(async (
    targetSessionKey: string,
    requestId: string,
    question: string,
    history: BookAgentClientHistoryMessage[],
  ) => {
    const controller = new AbortController()
    activeRef.current = { controller, sessionKey: targetSessionKey, requestId }

    const onEvent = (event: BookAgentClientEvent): void => {
      const active = activeRef.current
      if (
        committedSessionKeyRef.current !== targetSessionKey
        || !active
        || active.requestId !== requestId
        || active.sessionKey !== targetSessionKey
      ) return
      if (event.type === 'start') {
        dispatch({ type: 'start', sessionKey: targetSessionKey, requestId, turnId: event.turnId })
      } else if (event.type === 'delta') {
        dispatch({ type: 'delta', sessionKey: targetSessionKey, requestId, text: event.text })
      } else if (event.type === 'sources') {
        dispatch({ type: 'sources', sessionKey: targetSessionKey, requestId, sources: event.sources })
      } else if (event.type === 'done') {
        dispatch({ type: 'done', sessionKey: targetSessionKey, requestId })
        activeRef.current = null
      } else {
        dispatch({ type: 'error', sessionKey: targetSessionKey, requestId, message: event.message })
        activeRef.current = null
      }
    }

    try {
      const context = contextEnabled
        ? buildBookAgentContext(book, {
          chapterId: activeChapterId,
          scope,
          focusBlockId: focusBySession[targetSessionKey],
        })
        : null
      await streamBookAgent({ question, history, context }, { signal: controller.signal, onEvent })
    } catch (error) {
      const active = activeRef.current
      if (
        committedSessionKeyRef.current !== targetSessionKey
        || !active
        || active.requestId !== requestId
        || active.sessionKey !== targetSessionKey
      ) return
      activeRef.current = null
      if (isAbortError(error)) {
        dispatch({ type: 'cancel', sessionKey: targetSessionKey, requestId })
        return
      }
      const message = error instanceof BookAgentClientError ? error.message : FALLBACK_ERROR_MESSAGE
      dispatch({ type: 'error', sessionKey: targetSessionKey, requestId, message })
    }
  }, [activeChapterId, book, contextEnabled, dispatch, focusBySession, scope])

  const submit = useCallback(async (rawQuestion: string) => {
    const question = rawQuestion.trim()
    if (!question) return
    cancelActive()
    const requestId = clientId('request')
    const createdAt = new Date().toISOString()
    const currentMessages = stateRef.current.sessions[sessionKey]?.messages ?? []
    const history = completeBookAgentHistory(currentMessages)
    dispatch({
      type: 'submit',
      sessionKey,
      requestId,
      bookId: book.id,
      chapterId: activeChapterId,
      scope,
      question,
      userMessageId: clientId('user'),
      assistantMessageId: clientId('assistant'),
      createdAt,
    })
    await runStream(sessionKey, requestId, question, history)
  }, [activeChapterId, book.id, cancelActive, dispatch, runStream, scope, sessionKey])

  const retry = useCallback(async () => {
    const current = stateRef.current.sessions[sessionKey]
    if (!current || (current.status !== 'error' && current.status !== 'cancelled')) return
    const question = [...current.messages].reverse().find((message) => message.role === 'user')?.content
    if (!question) return
    cancelActive()
    const requestId = clientId('request')
    dispatch({
      type: 'retry',
      sessionKey,
      requestId,
      assistantMessageId: clientId('assistant'),
      createdAt: new Date().toISOString(),
    })
    await runStream(
      sessionKey,
      requestId,
      question,
      completeBookAgentHistory(current.messages, question),
    )
  }, [cancelActive, dispatch, runStream, sessionKey])

  const stop = useCallback(() => {
    const active = activeRef.current
    if (active?.sessionKey === sessionKey) cancelActive()
  }, [cancelActive, sessionKey])

  const newConversation = useCallback(() => {
    const active = activeRef.current
    if (active?.sessionKey === sessionKey) cancelActive()
    dispatch({ type: 'newConversation', sessionKey })
    setFocusBySession((current) => {
      if (!(sessionKey in current)) return current
      const next = { ...current }
      delete next[sessionKey]
      return next
    })
  }, [cancelActive, dispatch, sessionKey])

  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const previousSessionKey = useRef(sessionKey)
  useLayoutEffect(() => {
    const previous = previousSessionKey.current
    if (previous !== sessionKey && activeRef.current?.sessionKey === previous) cancelActive()
    committedSessionKeyRef.current = sessionKey
    previousSessionKey.current = sessionKey
  }, [cancelActive, sessionKey])

  useEffect(() => () => {
    activeRef.current?.controller.abort()
    activeRef.current = null
  }, [])

  const setFocusBlockId = useCallback((blockId: string | undefined) => {
    setFocusBySession((current) => ({ ...current, [sessionKey]: blockId }))
  }, [sessionKey])

  const session = useMemo<BookAgentSessionState>(() => state.sessions[sessionKey] ?? ({
    id: sessionKey,
    bookId: book.id,
    chapterId: activeChapterId,
    scope,
    messages: [],
    status: 'idle',
  }), [activeChapterId, book.id, scope, sessionKey, state.sessions])

  return {
    session,
    focusBlockId: focusBySession[sessionKey],
    setFocusBlockId,
    submit,
    stop,
    retry,
    newConversation,
  }
}
