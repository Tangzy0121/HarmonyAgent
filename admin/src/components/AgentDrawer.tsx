import { useState } from 'react'
import { agentPrompts, pageContext } from '../data/prototype'
import { useDrawerGesture } from '../hooks/useDrawerGesture'
import { GlassSurface } from './GlassSurface'
import { Icon } from './Icon'
import type { Destination, DrawerSnap } from '../types/prototype'

interface AgentDrawerProps {
  snap: DrawerSnap
  activeDestination: Destination
  draft: string
  onDraftChange: (draft: string) => void
  onSnapChange: (snap: DrawerSnap) => void
}

export function AgentDrawer({
  snap,
  activeDestination,
  draft,
  onDraftChange,
  onSnapChange,
}: AgentDrawerProps) {
  const [hasContext, setHasContext] = useState(true)
  const { grabAreaProps, isDragging, transform } = useDrawerGesture({
    snap,
    onSnapChange,
  })

  if (snap === 'closed') {
    return null
  }

  const isFullScreen = snap === 'full'

  return (
    <>
      <button className="agent-scrim" type="button" aria-label="关闭 Agent" onClick={() => onSnapChange('closed')} />
      <GlassSurface
        className={`agent-drawer${isFullScreen ? ' agent-drawer--full' : ''}${isDragging ? ' agent-drawer--dragging' : ''}`}
        density="thick"
        aria-label="自由 Agent"
        style={{ transform }}
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
          <span>{isFullScreen ? '恢复 75%' : '全屏'}</span>
        </button>
        <button className="drawer-close" type="button" onClick={() => onSnapChange('closed')}>
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="drawer-header">
        <div className="agent-identity"><Icon name="agent" size={18} /><span>Knowledge Agent</span></div>
        <h2>从当前内容开始</h2>
        <p>我会结合页面上下文，帮你整理概念和下一步。</p>
      </div>

      {hasContext ? <div className="context-row">
        <span>参考：{pageContext[activeDestination]}</span>
        <button type="button" aria-label="移除当前上下文" onClick={() => setHasContext(false)}>移除</button>
      </div> : <button className="context-add" type="button" onClick={() => setHasContext(true)}><Icon name="add" size={16} />添加当前页面为参考</button>}

      <div className="prompt-list" aria-label="建议问题">
        <p>可以这样问</p>
        {agentPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => onDraftChange(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <label className="agent-input">
        <span className="sr-only">向 Agent 提问</span>
        <input
          value={draft}
          placeholder="输入你的问题"
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button type="button" disabled={!draft.trim()}>
          <span className="agent-send-label">发送</span><Icon name="arrow" size={18} />
        </button>
      </label>
      </GlassSurface>
    </>
  )
}
