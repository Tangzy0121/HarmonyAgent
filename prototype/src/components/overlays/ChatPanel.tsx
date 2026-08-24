import { useEffect, useRef, useState } from 'react'

import { usePrototype } from '../../app/PrototypeContext'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

const scopeLabels = {
  learning_overview: '学习概况',
  library: '学习库',
  project: '当前项目',
  chapter: '当前章节',
  concept: '当前概念',
  selection: '选中文字',
} as const

export function ChatPanel() {
  const { state, activeProject, dispatch } = usePrototype()
  const [draft, setDraft] = useState('')
  const [showAction, setShowAction] = useState(false)
  const [actionConfirmed, setActionConfirmed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (state.chat.open) closeRef.current?.focus()
  }, [state.chat.open])

  if (!state.chat.open) return null

  const submit = () => {
    if (!draft.trim()) return
    dispatch({ type: 'send_chat', body: draft.trim() })
    setDraft('')
  }

  return (
    <>
      <button className="overlay-scrim" type="button" aria-label="关闭 Chat" onClick={() => dispatch({ type: 'close_chat' })} />
      <aside className="chat-panel" role="dialog" aria-modal="true" aria-labelledby="chat-title">
        <header className="overlay-header">
          <div><p><Icon name="spark" size={14} /> loci Chat</p><h2 id="chat-title">{state.chat.label}</h2></div>
          <button ref={closeRef} type="button" className="icon-button" aria-label="关闭 Chat" onClick={() => dispatch({ type: 'close_chat' })}><Icon name="close" size={19} /></button>
        </header>
        <div className="scope-control">
          <span>当前作用域</span>
          <button type="button"><strong>{scopeLabels[state.chat.scope]}</strong><small>{activeProject.title}</small><Icon name="chevron" size={15} /></button>
        </div>
        <div className="chat-messages" aria-live="polite">
          {state.chat.messages.map((message) => (
            <article key={message.id} className={`chat-message chat-message--${message.role}`}>
              <span>{message.role === 'assistant' ? 'loci' : '你'}</span>
              <p>{message.body}</p>
              {message.supplement && <small>补充说明 · 不来自当前资料</small>}
              {message.sourceIds && <div className="chat-citations">{message.sourceIds.map((sourceId, index) => <button key={sourceId} type="button" onClick={() => dispatch({ type: 'open_source', anchorId: sourceId })}>来源 {index + 1}</button>)}</div>}
            </article>
          ))}
          {showAction && (
            <section className="proposed-action">
              <p>建议动作 · 需要确认</p>
              <strong>把“损失与泛化”加入下一次复习</strong>
              <span>这会创建一个复习任务，但不会直接修改概念状态。</span>
              {actionConfirmed ? <small><Icon name="check" size={14} />已创建，稍后可以在今日处理</small> : <div><Button variant="accent" onClick={() => setActionConfirmed(true)}>确认创建</Button><Button variant="ghost" onClick={() => setShowAction(false)}>取消</Button></div>}
            </section>
          )}
        </div>
        <div className="chat-suggestions">
          <button type="button" onClick={() => setDraft('为什么训练损失不能代表泛化能力？')}>解释关键区别</button>
          <button type="button" onClick={() => setShowAction(true)}>建议一个复习动作</button>
        </div>
        <footer className="chat-composer">
          <textarea rows={2} value={draft} placeholder={`基于${state.chat.label}提问…`} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} />
          <button type="button" aria-label="发送问题" disabled={!draft.trim()} onClick={submit}><Icon name="arrow" size={18} /></button>
        </footer>
      </aside>
    </>
  )
}
