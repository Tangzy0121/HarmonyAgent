import { describe, expect, it } from 'vitest'

import {
  bookAgentSessionKey,
  bookAgentSessionReducer,
  initialBookAgentSessionsState,
  type BookAgentSessionAction,
  type BookAgentSessionsState,
} from './bookAgentSessionReducer'
import type { BookAgentMessage, BookAgentSource } from '../types/bookAgent'
import { completeBookAgentHistory } from './useBookAgentSessions'

const chapterKey = 'book-1:chapter:ch-1'
const bookKey = 'book-1:book:all'
const source: BookAgentSource = {
  id: 'S1',
  sourceId: 'source-1',
  fileName: '机器学习.pdf',
  pageRange: '4–5',
  excerpt: '监督学习使用带标签的数据。',
  chapterId: 'ch-1',
  blockId: 'blk-1',
}

function reduce(actions: BookAgentSessionAction[]): BookAgentSessionsState {
  return actions.reduce(bookAgentSessionReducer, initialBookAgentSessionsState)
}

function submit(sessionKey = chapterKey, requestId = 'request-1'): BookAgentSessionAction {
  return {
    type: 'submit',
    sessionKey,
    requestId,
    bookId: 'book-1',
    chapterId: 'ch-1',
    scope: sessionKey === bookKey ? 'book' : 'chapter',
    question: '为什么需要标签？',
    userMessageId: `${requestId}-user`,
    assistantMessageId: `${requestId}-assistant`,
    createdAt: '2026-08-09T10:00:00.000Z',
  }
}

describe('bookAgentSessionKey', () => {
  it('creates stable chapter and whole-book keys', () => {
    expect(bookAgentSessionKey('book-1', 'ch-1', 'chapter')).toBe(chapterKey)
    expect(bookAgentSessionKey('book-1', 'ch-1', 'book')).toBe(bookKey)
  })
})

describe('bookAgentSessionReducer', () => {
  it('runs submit → start → delta → sources → done with one accumulating assistant message', () => {
    const state = reduce([
      submit(),
      { type: 'start', sessionKey: chapterKey, requestId: 'request-1', turnId: 'turn-1' },
      { type: 'delta', sessionKey: chapterKey, requestId: 'request-1', text: '标签' },
      { type: 'delta', sessionKey: chapterKey, requestId: 'request-1', text: '提供监督信号。[S1]' },
      { type: 'sources', sessionKey: chapterKey, requestId: 'request-1', sources: [source] },
      { type: 'done', sessionKey: chapterKey, requestId: 'request-1' },
    ])

    const session = state.sessions[chapterKey]
    expect(session.turnId).toBe('turn-1')
    expect(session.status).toBe('idle')
    expect(session.messages).toHaveLength(2)
    expect(session.messages[0]).toMatchObject({ role: 'user', content: '为什么需要标签？', status: 'complete' })
    expect(session.messages[1]).toMatchObject({
      role: 'assistant',
      content: '标签提供监督信号。[S1]',
      status: 'complete',
      sources: [source],
    })
  })

  it('distinguishes a safe failure from user cancellation', () => {
    const failed = reduce([
      submit(chapterKey, 'failed'),
      { type: 'error', sessionKey: chapterKey, requestId: 'failed', message: '暂时不可用' },
    ]).sessions[chapterKey]
    const cancelled = reduce([
      submit(chapterKey, 'cancelled'),
      { type: 'delta', sessionKey: chapterKey, requestId: 'cancelled', text: '部分内容' },
      { type: 'cancel', sessionKey: chapterKey, requestId: 'cancelled' },
    ]).sessions[chapterKey]

    expect(failed.status).toBe('error')
    expect(failed.errorMessage).toBe('暂时不可用')
    expect(failed.messages[failed.messages.length - 1]?.status).toBe('error')
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.errorMessage).toBeUndefined()
    expect(cancelled.messages[cancelled.messages.length - 1]).toMatchObject({ content: '部分内容', status: 'cancelled' })
  })

  it('retries the last user turn without duplicating that user or older history', () => {
    const firstState = reduce([
      submit(chapterKey, 'first'),
      { type: 'error', sessionKey: chapterKey, requestId: 'first', message: '失败' },
    ])
    const retried = bookAgentSessionReducer(firstState, {
      type: 'retry',
      sessionKey: chapterKey,
      requestId: 'retry-1',
      assistantMessageId: 'retry-assistant',
      createdAt: '2026-08-09T10:01:00.000Z',
    }).sessions[chapterKey]

    expect(retried.messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(retried.messages).toHaveLength(2)
    expect(retried.messages[0].content).toBe('为什么需要标签？')
    expect(retried.messages[1]).toMatchObject({
      id: 'retry-assistant',
      role: 'assistant',
      content: '',
      status: 'streaming',
    })
    expect(retried.activeRequestId).toBe('retry-1')
  })

  it('isolates chapter and whole-book sessions and ignores stale request events', () => {
    const state = reduce([
      submit(chapterKey, 'old'),
      { type: 'cancel', sessionKey: chapterKey, requestId: 'old' },
      submit(chapterKey, 'new'),
      { type: 'delta', sessionKey: chapterKey, requestId: 'old', text: 'stale' },
      submit(bookKey, 'book-request'),
      { type: 'delta', sessionKey: bookKey, requestId: 'book-request', text: 'whole book' },
    ])

    const chapterMessages = state.sessions[chapterKey].messages
    const bookMessages = state.sessions[bookKey].messages
    expect(chapterMessages[chapterMessages.length - 1]?.content).toBe('')
    expect(chapterMessages[1].status).toBe('cancelled')
    expect(state.sessions[chapterKey].messages.filter((message) => message.role === 'user')).toHaveLength(2)
    expect(bookMessages[bookMessages.length - 1]?.content).toBe('whole book')
  })

  it('clears only the selected conversation', () => {
    const state = reduce([submit(chapterKey), submit(bookKey, 'book-request')])
    const cleared = bookAgentSessionReducer(state, { type: 'newConversation', sessionKey: chapterKey })

    expect(cleared.sessions[chapterKey]).toBeUndefined()
    expect(cleared.sessions[bookKey]).toBeDefined()
  })
})

describe('completeBookAgentHistory', () => {
  it('keeps only the last six complete messages and can exclude the retried user turn', () => {
    const messages: BookAgentMessage[] = Array.from({ length: 8 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `message ${index}`,
      status: 'complete' as const,
      createdAt: `2026-08-09T10:00:0${index}.000Z`,
    }))
    messages.push({
      id: 'streaming',
      role: 'assistant',
      content: 'partial',
      status: 'streaming',
      createdAt: '2026-08-09T10:00:09.000Z',
    })
    messages.push({
      id: 'failed',
      role: 'assistant',
      content: 'failed placeholder',
      status: 'error',
      createdAt: '2026-08-09T10:00:10.000Z',
    })
    messages.push({
      id: 'cancelled',
      role: 'assistant',
      content: 'cancelled placeholder',
      status: 'cancelled',
      createdAt: '2026-08-09T10:00:11.000Z',
    })

    expect(completeBookAgentHistory(messages)).toEqual([
      { role: 'user', content: 'message 2' },
      { role: 'assistant', content: 'message 3' },
      { role: 'user', content: 'message 4' },
      { role: 'assistant', content: 'message 5' },
      { role: 'user', content: 'message 6' },
      { role: 'assistant', content: 'message 7' },
    ])
    expect(completeBookAgentHistory(messages, 'message 6')).toEqual([
      { role: 'user', content: 'message 0' },
      { role: 'assistant', content: 'message 1' },
      { role: 'user', content: 'message 2' },
      { role: 'assistant', content: 'message 3' },
      { role: 'user', content: 'message 4' },
      { role: 'assistant', content: 'message 5' },
    ])
  })
})
