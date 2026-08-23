import { Icon } from '../Icon'
import type { AgentContextScope } from '../../types/learningBook'

interface BookContextBarProps {
  contextScope: AgentContextScope
  onContextScopeChange: (scope: AgentContextScope) => void
  onAskAgent: (focusBlockId?: string) => void
}

export function BookContextBar({ contextScope, onContextScopeChange, onAskAgent }: BookContextBarProps) {
  return (
    <section className="book-context-bar" aria-label="Agent 参考范围">
      <div>
        <Icon name="agent" size={19} />
        <span>提问时</span>
        <button
          type="button"
          className={contextScope === 'chapter' ? 'is-active' : ''}
          aria-pressed={contextScope === 'chapter'}
          onClick={() => onContextScopeChange('chapter')}
        >优先参考当前章节</button>
        <button
          type="button"
          className={contextScope === 'book' ? 'is-active' : ''}
          aria-pressed={contextScope === 'book'}
          onClick={() => onContextScopeChange('book')}
        >扩展到整本书</button>
      </div>
      <button type="button" className="book-context-bar__ask" onClick={() => onAskAgent(undefined)}>
        随时追问 Agent <Icon name="arrow" size={16} />
      </button>
    </section>
  )
}
