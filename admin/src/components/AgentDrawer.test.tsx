import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { BookAgentSessionState } from '../hooks/bookAgentSessionReducer'
import type { BookAgentSource } from '../types/bookAgent'
import { AgentDrawer } from './AgentDrawer'

const knownSource: BookAgentSource = {
  id: 'S1',
  sourceId: 'source-1',
  fileName: '机器学习 · 第三章.pdf',
  pageRange: '第 4–6 页',
  excerpt: '目标值参与预测比较，才能形成监督信号。',
  chapterId: 'ch-1',
  blockId: 'blk-explanation-1',
}

const unusedSource: BookAgentSource = {
  ...knownSource,
  id: 'S3',
  sourceId: 'source-3',
  pageRange: '第 8 页',
  excerpt: '这条来源没有被回答引用。',
}

const secondSource: BookAgentSource = {
  ...knownSource,
  id: 'S2',
  sourceId: 'source-2',
  pageRange: '第 7 页',
  excerpt: '先被回答提到的第二条来源。',
}

function renderControlled(session: BookAgentSessionState, contextEnabled = true): string {
  return renderToStaticMarkup(
    <AgentDrawer
      snap="full"
      activeDestination="library"
      contextLabel="第 1 章 · 从训练信号理解机器学习"
      contextEnabled={contextEnabled}
      draft=""
      bookSession={session}
      onDraftChange={() => undefined}
      onSnapChange={() => undefined}
      onSubmitQuestion={() => undefined}
      onStop={() => undefined}
      onRetry={() => undefined}
      onNewConversation={() => undefined}
      onContextEnabledChange={() => undefined}
      onSourceOpen={() => undefined}
    />,
  )
}

function session(overrides: Partial<BookAgentSessionState> = {}): BookAgentSessionState {
  return {
    id: 'book-1:chapter:ch-1',
    bookId: 'book-1',
    chapterId: 'ch-1',
    scope: 'chapter',
    status: 'idle',
    messages: [],
    ...overrides,
  }
}

describe('AgentDrawer controlled learning-book mode', () => {
  it('renders streaming, error, and cancelled states with explicit actions', () => {
    const streamingHtml = renderControlled(session({
      status: 'streaming',
      activeRequestId: 'request-1',
      messages: [{ id: 'assistant-1', role: 'assistant', content: '正在核对原文', status: 'streaming', createdAt: '2026-08-09' }],
    }))
    expect(streamingHtml).toContain('停止生成')
    expect(streamingHtml).toContain('aria-live="polite"')

    const errorHtml = renderControlled(session({
      status: 'error',
      errorMessage: '学习助手暂时不可用',
      messages: [{ id: 'assistant-2', role: 'assistant', content: '', status: 'error', createdAt: '2026-08-09' }],
    }))
    expect(errorHtml).toContain('重新尝试')
    expect(errorHtml).toContain('学习助手暂时不可用')

    const cancelledHtml = renderControlled(session({
      status: 'cancelled',
      messages: [{ id: 'assistant-3', role: 'assistant', content: '已生成的部分', status: 'cancelled', createdAt: '2026-08-09' }],
    }))
    expect(cancelledHtml).toContain('已停止')
    expect(cancelledHtml).toContain('重新尝试')
  })

  it('shows only real sources cited by an assistant answer', () => {
    const html = renderControlled(session({
      messages: [{
        id: 'assistant-4',
        role: 'assistant',
        content: '先看补充定义。[S2] 再看监督信号。[S1] 重复引用仍只显示一次。[S2] 未知来源不应出现。[S99]',
        status: 'complete',
        createdAt: '2026-08-09',
        sources: [knownSource, secondSource, unusedSource],
      }],
    }))

    expect(html).toContain('第 4–6 页')
    expect(html.indexOf('第 7 页')).toBeLessThan(html.indexOf('第 4–6 页'))
    expect(html).toContain('目标值参与预测比较')
    expect(html.match(/证据 S2/g)).toHaveLength(1)
    expect(html).not.toContain('第 8 页')
    expect(html).not.toContain('固定演示回答中的句子')
    expect(html).not.toContain('S99</')
  })

  it('keeps source cards actionable in controlled mode', () => {
    const onSourceOpen = vi.fn()
    const html = renderToStaticMarkup(
      <AgentDrawer
        snap="full"
        activeDestination="library"
        contextEnabled
        draft=""
        bookSession={session({
          messages: [{ id: 'assistant-5', role: 'assistant', content: '依据见 [S1]。', status: 'complete', createdAt: '2026-08-09', sources: [knownSource] }],
        })}
        onDraftChange={() => undefined}
        onSnapChange={() => undefined}
        onSourceOpen={onSourceOpen}
      />,
    )

    expect(html).toContain('查看原文位置')
  })

  it('states explicitly when learning-book context is detached', () => {
    const html = renderControlled(session(), false)

    expect(html).toContain('重新附加学习书依据')
    expect(html).toContain('当前未附加学习书依据')
  })
})
