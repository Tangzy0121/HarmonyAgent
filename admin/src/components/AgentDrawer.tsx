import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, FormEvent, KeyboardEvent } from 'react'
import { agentConversation, agentPrompts, pageContext } from '../data/prototype'
import type { BookAgentSessionState } from '../hooks/bookAgentSessionReducer'
import { useDrawerGesture } from '../hooks/useDrawerGesture'
import type { BookAgentSource } from '../types/bookAgent'
import { GlassSurface } from './GlassSurface'
import { Icon } from './Icon'
import type { Destination, DrawerSnap } from '../types/prototype'

interface AgentDrawerProps {
  snap: DrawerSnap
  activeDestination: Destination
  contextLabel?: string
  modeLabel?: string
  contextEnabled?: boolean
  draft: string
  bookSession?: BookAgentSessionState
  onDraftChange: (draft: string) => void
  onSnapChange: (snap: DrawerSnap) => void
  onSubmitQuestion?: (question: string) => void | Promise<void>
  onStop?: () => void
  onRetry?: () => void | Promise<void>
  onNewConversation?: () => void
  onContextEnabledChange?: (enabled: boolean) => void
  onSourceOpen?: (source: BookAgentSource) => void
}

interface AgentMessage {
  id: string
  role: 'agent' | 'user'
  label: string
  body: string
  citation?: {
    title: string
    location: string
    excerpt: string
  }
  points?: readonly string[]
}

const initialMessages: AgentMessage[] = agentConversation.messages.map((message) => ({
  ...message,
  role: message.role,
}))

function referencedSources(content: string, sources: BookAgentSource[] | undefined): BookAgentSource[] {
  if (!sources?.length) return []
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const seen = new Set<string>()
  const referenced: BookAgentSource[] = []
  for (const match of content.matchAll(/\[(S[1-9]\d*)\]/gu)) {
    const id = match[1] as BookAgentSource['id']
    if (seen.has(id)) continue
    seen.add(id)
    const source = sourceById.get(id)
    if (source) referenced.push(source)
  }
  return referenced
}

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth'
}

export function AgentDrawer({
  snap,
  activeDestination,
  contextLabel,
  modeLabel,
  contextEnabled = true,
  draft,
  bookSession,
  onDraftChange,
  onSnapChange,
  onSubmitQuestion,
  onStop,
  onRetry,
  onNewConversation,
  onContextEnabledChange,
  onSourceOpen,
}: AgentDrawerProps) {
  const [hasContext, setHasContext] = useState(true)
  const [activeView, setActiveView] = useState<'conversation' | 'history'>('conversation')
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages)
  const inputRef = useRef<HTMLInputElement>(null)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(initialMessages.length)
  const restoreSnapAfterKeyboardRef = useRef<DrawerSnap | null>(null)
  const { grabAreaProps, isDragging, dragOffset, materialProgress, transform } = useDrawerGesture({
    snap,
    onSnapChange,
  })

  const isFullScreen = snap === 'full'
  const isBookMode = bookSession !== undefined
  const effectiveActiveView = isBookMode ? 'conversation' : activeView
  const visibleMessageCount = isBookMode ? bookSession.messages.length : messages.length
  const isStreaming = isBookMode && bookSession.status === 'streaming'

  useEffect(() => {
    const previousCount = previousMessageCountRef.current
    previousMessageCountRef.current = visibleMessageCount
    if (!isFullScreen || effectiveActiveView !== 'conversation' || visibleMessageCount <= previousCount) return
    conversationEndRef.current?.scrollIntoView({ block: 'end', behavior: preferredScrollBehavior() })
  }, [effectiveActiveView, isFullScreen, visibleMessageCount])

  if (snap === 'closed') {
    return null
  }

  const expansionOffset = snap === 'default' && dragOffset < 0 ? -dragOffset : 0
  const resolvedMaterialProgress = isDragging ? materialProgress : isFullScreen ? 1 : 0
  const drawerStyle = {
    transform: expansionOffset ? undefined : transform,
    minHeight: expansionOffset ? `calc(75dvh + ${expansionOffset}px)` : undefined,
    '--agent-full-progress': resolvedMaterialProgress,
  } as CSSProperties
  const inputStyle = {
    transform: isDragging && !expansionOffset ? transform : undefined,
  } as CSSProperties

  const startNewConversation = () => {
    if (isBookMode) onNewConversation?.()
    else setMessages([])
    setActiveView('conversation')
    if (!isBookMode) setHasContext(true)
    onDraftChange('')
    if (!isFullScreen) {
      onSnapChange('full')
    }
    window.setTimeout(() => inputRef.current?.focus(), 280)
  }

  const restoreConversation = () => {
    setMessages(initialMessages)
    setActiveView('conversation')
  }

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const question = draft.trim()
    if (!question || isStreaming) return

    if (isBookMode) {
      void onSubmitQuestion?.(question)
      onDraftChange('')
      if (!isFullScreen) onSnapChange('full')
      return
    }

    const timestamp = Date.now()
    setMessages((current) => [
      ...current,
      {
        id: `user-${timestamp}`,
        role: 'user',
        label: '你',
        body: question,
      },
      {
        id: `agent-${timestamp}`,
        role: 'agent',
        label: 'Knowledge Agent',
        body: '可以先回到训练阶段检查两件事：有没有目标答案，以及模型是否会把预测结果与这个答案比较。两者同时成立，才形成监督信号。',
        citation: {
          title: '《机器学习》第三章',
          location: '第 4–6 页',
          excerpt: '目标值需要参与预测比较，才能形成用于更新模型的误差信号。',
        },
      },
    ])
    onDraftChange('')
    if (!isFullScreen) onSnapChange('full')
  }

  const handleInputFocus = () => {
    if (snap === 'default') {
      restoreSnapAfterKeyboardRef.current = 'default'
      onSnapChange('full')
    }
  }

  const handleInputBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Element && nextTarget.closest('.agent-input')) return
    window.setTimeout(() => {
      if (restoreSnapAfterKeyboardRef.current !== 'default' || snap !== 'full') return
      restoreSnapAfterKeyboardRef.current = null
      onSnapChange('default')
    }, 120)
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
  }

  return (
    <>
      <button className="agent-scrim" type="button" aria-label="点击遮罩关闭 Agent" onClick={() => onSnapChange('closed')} />
      <GlassSurface
        className={`agent-drawer${isFullScreen ? ' agent-drawer--full' : ''}${isDragging ? ' agent-drawer--dragging' : ''}`}
        density="thick"
        role="dialog"
        aria-modal="true"
        aria-label={isBookMode ? '学习书 Agent' : '自由 Agent'}
        style={drawerStyle}
      >
        <div className="drawer-grab-area" {...grabAreaProps}>
          <span className="drawer-handle" aria-hidden="true" />
          <button
            className="drawer-size-control"
            type="button"
            aria-label={isFullScreen ? '恢复为 75% 高度' : '展开为全屏'}
            aria-expanded={isFullScreen}
            onClick={() => onSnapChange(isFullScreen ? 'default' : 'full')}
          >
            <Icon name="expand" size={18} />
            <span>{isFullScreen ? '返回 75%' : '全屏'}</span>
          </button>
          <button className="drawer-close" type="button" aria-label="关闭 Agent" onClick={() => onSnapChange('closed')}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {(!isBookMode || visibleMessageCount > 0) && <nav className="agent-conversation-toolbar" aria-label="对话操作">
          {!isBookMode && <button
            type="button"
            aria-pressed={activeView === 'history'}
            onClick={() => setActiveView((current) => current === 'history' ? 'conversation' : 'history')}
          >
            <Icon name="history" size={18} />历史
          </button>}
          {(!isBookMode || !isStreaming) && <button type="button" onClick={startNewConversation}>
            <Icon name="compose" size={18} />新建对话
          </button>}
        </nav>}

        {effectiveActiveView === 'history' ? (
          <section className="agent-history" aria-labelledby="agent-history-title">
            <header>
              <div className="agent-identity"><Icon name="blossom" size={18} /><span>Knowledge Agent</span></div>
              <h2 id="agent-history-title">最近对话</h2>
              <p>选择一段对话，继续保留当时的知识上下文。</p>
            </header>
            <div className="agent-history__list">
              {agentConversation.history.map((item, index) => (
                <button type="button" key={item.id} onClick={restoreConversation}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item.title}</strong>
                  <small>{item.meta}</small>
                  <Icon name="arrow" size={17} />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <header className="drawer-header">
              <div className="agent-identity"><Icon name="blossom" size={18} /><span>Knowledge Agent</span></div>
              {modeLabel && <span className="agent-workflow-label">{modeLabel}</span>}
              <h2>{isBookMode ? (visibleMessageCount ? '沿着原文继续追问' : '从当前章节开始') : isFullScreen && messages.length ? agentConversation.title : '从当前内容开始'}</h2>
              <p>{isBookMode ? '回答只依据你附加的学习书内容；引用可以带你回到原文位置。' : isFullScreen && messages.length ? '围绕当前知识点继续追问，引用会保留来源位置。' : '我会结合页面上下文，帮你整理概念和下一步。'}</p>
            </header>

            {(isBookMode ? contextEnabled : hasContext) ? <div className="context-row">
              <span>参考：{contextLabel ?? pageContext[activeDestination]}</span>
              <button type="button" aria-label="移除当前上下文" onClick={() => isBookMode ? onContextEnabledChange?.(false) : setHasContext(false)}>移除</button>
            </div> : <button className="context-add" type="button" onClick={() => isBookMode ? onContextEnabledChange?.(true) : setHasContext(true)}><Icon name="add" size={16} />{isBookMode ? '重新附加学习书依据' : '添加当前页面为参考'}</button>}

            {isBookMode && isFullScreen && visibleMessageCount ? (
              <section className="agent-transcript agent-transcript--book" aria-label="当前学习书对话">
                {bookSession.messages.map((message) => {
                  const sources = message.role === 'assistant' ? referencedSources(message.content, message.sources) : []
                  return <article className={`agent-message agent-message--${message.role === 'assistant' ? 'agent' : 'user'}`} key={message.id}>
                    <header>
                      {message.role === 'assistant' && <Icon name="blossom" size={16} />}
                      <span>{message.role === 'assistant' ? 'Knowledge Agent' : '你'}</span>
                    </header>
                    <p aria-live={message.status === 'streaming' ? 'polite' : undefined} aria-atomic={message.status === 'streaming' ? 'false' : undefined}>
                      {message.content || (message.status === 'streaming' ? '正在查找依据…' : '')}
                    </p>
                    {message.status === 'cancelled' && <span className="agent-message__status">已停止</span>}
                    {message.status === 'error' && <span className="agent-message__status agent-message__status--error">{bookSession.errorMessage ?? '本次回答生成失败。'}</span>}
                    {sources.length > 0 && <ul className="agent-source-list" aria-label="回答引用的原文依据">
                      {sources.map((source) => <li key={source.id}><button
                          className="agent-source-card"
                          type="button"
                          aria-label={`查看证据 ${source.id}：${source.fileName} ${source.pageRange}`}
                          onClick={() => onSourceOpen?.(source)}
                        >
                          <span className="agent-source-card__index">证据 {source.id}</span>
                          <strong>{source.fileName}</strong>
                          <span>{source.pageRange}</span>
                          <small>{source.excerpt}</small>
                          <em>查看原文位置 <Icon name="arrow" size={15} /></em>
                        </button></li>)}
                    </ul>}
                  </article>
                })}
                {(bookSession.status === 'streaming' || bookSession.status === 'error' || bookSession.status === 'cancelled') && <div className="agent-session-actions" role="group" aria-label="本轮回答操作">
                  {bookSession.status === 'streaming' && <button type="button" onClick={onStop}>停止生成</button>}
                  {(bookSession.status === 'error' || bookSession.status === 'cancelled') && <button type="button" onClick={() => void onRetry?.()}>重新尝试</button>}
                </div>}
                <div ref={conversationEndRef} />
              </section>
            ) : !isBookMode && isFullScreen && messages.length ? (
              <section className="agent-transcript" aria-label="当前对话">
                {messages.map((message) => (
                  <article className={`agent-message agent-message--${message.role}`} key={message.id}>
                    <header>
                      {message.role === 'agent' && <Icon name="blossom" size={16} />}
                      <span>{message.label}</span>
                    </header>
                    <p>{message.body}</p>
                    {message.points && <ol>{message.points.map((point) => <li key={point}>{point}</li>)}</ol>}
                    {message.citation && <button className="agent-citation" type="button">
                      <span><Icon name="link" size={16} />{message.citation.title} · {message.citation.location}</span>
                      <small>{message.citation.excerpt}</small>
                    </button>}
                  </article>
                ))}
                <div className="agent-followups" role="group" aria-label="继续追问">
                  <p>继续追问</p>
                  {agentConversation.followUps.map((prompt) => (
                    <button type="button" key={prompt} onClick={() => onDraftChange(prompt)}>
                      {prompt}<Icon name="arrow" size={16} />
                    </button>
                  ))}
                </div>
                <div ref={conversationEndRef} />
              </section>
            ) : isBookMode ? (
              <div className="prompt-list prompt-list--book" role="group" aria-label="学习书提问提示">
                <p>{contextEnabled ? '可以问概念、例子，或让 Agent 对照原文解释。' : '当前未附加学习书依据，回答不会生成原文引用。'}</p>
              </div>
            ) : (
              <div className="prompt-list" role="group" aria-label="建议问题">
                <p>{messages.length ? '可以这样问' : '新对话可以从这里开始'}</p>
                {agentPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => onDraftChange(prompt)}>
                    <span>{prompt}</span><Icon name="arrow" size={16} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

      </GlassSurface>
      {effectiveActiveView === 'conversation' && <form
        className={`agent-input${isFullScreen ? ' agent-input--full' : ''}`}
        style={inputStyle}
        onSubmit={submitDraft}
      >
          <label className="sr-only" htmlFor="agent-question">向 Agent 提问</label>
          <Icon name="compose" size={18} />
          <input
            id="agent-question"
            ref={inputRef}
            value={draft}
            placeholder="继续问当前知识点"
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            onChange={(event) => onDraftChange(event.target.value)}
            disabled={isStreaming}
          />
          <button type="submit" aria-label="发送问题" disabled={!draft.trim() || isStreaming}>
            <span className="agent-send-label">发送</span><Icon name="arrow" size={18} />
          </button>
        </form>}
    </>
  )
}
