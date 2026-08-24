import { useEffect, useRef, useState } from 'react'

import { usePrototype } from '../../app/PrototypeContext'
import { Icon } from '../ui/Icon'

export function SourceViewer() {
  const { state, activeProject, activeAnchor, dispatch } = usePrototype()
  const [expanded, setExpanded] = useState(true)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (state.source.open) closeRef.current?.focus()
  }, [state.source.open])

  if (!state.source.open || !activeAnchor) return null
  return (
    <>
      <button className="overlay-scrim overlay-scrim--source" type="button" aria-label="关闭来源" onClick={() => dispatch({ type: 'close_source' })} />
      <aside className="source-viewer" role="dialog" aria-modal="true" aria-labelledby="source-title">
        <header className="overlay-header">
          <div><p><Icon name="source" size={14} /> 来源查看器</p><h2 id="source-title">{activeProject.source.name}</h2></div>
          <button ref={closeRef} type="button" className="icon-button" aria-label="关闭来源" onClick={() => dispatch({ type: 'close_source' })}><Icon name="close" size={19} /></button>
        </header>
        <div className="source-toolbar">
          <button type="button"><Icon name="search" size={16} />搜索</button>
          <button type="button">100%</button>
          <span>{activeAnchor.location}</span>
        </div>
        <article className="source-paper">
          <p className="source-paper__running">{activeProject.source.name} · {activeAnchor.location}</p>
          <p>{activeAnchor.contextBefore}</p>
          <mark>{activeAnchor.excerpt}</mark>
          <p>{activeAnchor.contextAfter}</p>
          {expanded && <p>这里保留必要的前后文，帮助核查 Agent 的讲解是否准确表达了资料，而不是只展示一句失去语境的引用。</p>}
        </article>
        <footer className="source-footer">
          <span>定位精度：{activeAnchor.precision === 'exact' ? '精确文本' : activeAnchor.precision === 'unit' ? '章节范围' : '页级范围'}</span>
          <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? '收起前后文' : '查看更多前后文'}</button>
        </footer>
      </aside>
    </>
  )
}
