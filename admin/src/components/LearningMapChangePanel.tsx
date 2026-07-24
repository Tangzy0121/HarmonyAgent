import { learningCompletion } from '../data/prototype'
import type { KnowledgeNode } from '../data/learningMap'
import { Icon } from './Icon'

interface LearningMapChangePanelProps {
  node: KnowledgeNode
  onScheduleNext: () => void
}

export function LearningMapChangePanel({ node, onScheduleNext }: LearningMapChangePanelProps) {
  const record = learningCompletion.record

  return (
    <aside className="map-change-panel" aria-label={`${node.label}本次学习变化`}>
      <div className="map-change-panel__grip" aria-hidden="true" />
      <header className="map-change-panel__heading">
        <div>
          <p><span aria-hidden="true" />方法 · {node.learningState}</p>
          <h2>{node.label}</h2>
        </div>
      </header>

      <section className="map-change-evidence" aria-label="新增学习证据">
        <div className="map-change-evidence__lead">
          <span><i aria-hidden="true" />新增学习证据</span>
          <strong>1 条新关系</strong>
        </div>
        <p>{record.statement}</p>
        <footer>
          <span><Icon name="document" size={15} />{record.source}</span>
          <span>{record.relation}</span>
        </footer>
      </section>

      <footer className="map-change-panel__actions">
        <div>
          <span>本次变化</span>
          <strong>证据已附着到节点</strong>
        </div>
        <button
          type="button"
          className="map-change-panel__primary"
          onClick={onScheduleNext}
        >
          安排下一次<Icon name="arrow" size={17} />
        </button>
      </footer>
    </aside>
  )
}
