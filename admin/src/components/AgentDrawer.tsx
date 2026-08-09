import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, FormEvent } from 'react'
import { agentConversation, agentPrompts, pageContext } from '../data/prototype'
import { useDrawerGesture } from '../hooks/useDrawerGesture'
import { GlassSurface } from './GlassSurface'
import { Icon } from './Icon'
import type { Destination, DrawerSnap } from '../types/prototype'

interface AgentDrawerProps {
  snap: DrawerSnap
  activeDestination: Destination
  contextLabel?: string
  modeLabel?: string
  draft: string
  onDraftChange: (draft: string) => void
  onSnapChange: (snap: DrawerSnap) => void
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

export function AgentDrawer({
  snap,
  activeDestination,
  contextLabel,
  modeLabel,
  draft,
  onDraftChange,
  onSnapChange,
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

  useEffect(() => {
    const previousCount = previousMessageCountRef.current
    previousMessageCountRef.current = messages.length
    if (!isFullScreen || activeView !== 'conversation' || messages.length <= previousCount) return
    conversationEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [activeView, isFullScreen, messages.length])

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
    setMessages([])
    setActiveView('conversation')
    setHasContext(true)
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
    if (!question) return

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

  return (
    <>
      <button className="agent-scrim" type="button" aria-label="点击遮罩关闭 Agent" onClick={() => onSnapChange('closed')} />
      <GlassSurface
        className={`agent-drawer${isFullScreen ? ' agent-drawer--full' : ''}${isDragging ? ' agent-drawer--dragging' : ''}`}
        density="thick"
        role="dialog"
        aria-modal="true"
        aria-label="自由 Agent"
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

        <nav className="agent-conversation-toolbar" aria-label="对话操作">
          <button
            type="button"
            aria-pressed={activeView === 'history'}
            onClick={() => setActiveView((current) => current === 'history' ? 'conversation' : 'history')}
          >
            <Icon name="history" size={18} />历史
          </button>
          <button type="button" onClick={startNewConversation}>
            <Icon name="compose" size={18} />新建对话
          </button>
        </nav>

        {activeView === 'history' ? (
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
              <h2>{isFullScreen && messages.length ? agentConversation.title : '从当前内容开始'}</h2>
              <p>{isFullScreen && messages.length ? '围绕当前知识点继续追问，引用会保留来源位置。' : '我会结合页面上下文，帮你整理概念和下一步。'}</p>
            </header>

            {hasContext ? <div className="context-row">
              <span>参考：{contextLabel ?? pageContext[activeDestination]}</span>
              <button type="button" aria-label="移除当前上下文" onClick={() => setHasContext(false)}>移除</button>
            </div> : <button className="context-add" type="button" onClick={() => setHasContext(true)}><Icon name="add" size={16} />添加当前页面为参考</button>}

            {isFullScreen && messages.length ? (
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
                <div className="agent-followups" aria-label="继续追问">
                  <p>继续追问</p>
                  {agentConversation.followUps.map((prompt) => (
                    <button type="button" key={prompt} onClick={() => onDraftChange(prompt)}>
                      {prompt}<Icon name="arrow" size={16} />
                    </button>
                  ))}
                </div>
                <div ref={conversationEndRef} />
              </section>
            ) : (
              <div className="prompt-list" aria-label="建议问题">
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
      {activeView === 'conversation' && <form
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
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <button type="submit" disabled={!draft.trim()}>
            <span className="agent-send-label">发送</span><Icon name="arrow" size={18} />
          </button>
        </form>}
    </>
  )
}
