import { useMemo, useState } from 'react'

import { usePrototype } from '../../app/PrototypeContext'
import type { Concept, ConceptRelation, LearningProject } from '../../types/product'
import { Icon } from '../ui/Icon'
import { StatusBadge } from '../ui/StatusBadge'

const relationLabels: Record<ConceptRelation['type'], string> = {
  depends_on: '依赖',
  part_of: '组成',
  causes: '导致',
  contrasts_with: '对比',
  applies_to: '应用于',
  extends: '扩展',
}

const positions = [
  { x: 18, y: 24 }, { x: 48, y: 14 }, { x: 76, y: 31 }, { x: 34, y: 53 },
  { x: 68, y: 62 }, { x: 18, y: 78 }, { x: 86, y: 82 },
]

function ConceptDetail({ concept, project, onClose }: { concept: Concept; project: LearningProject; onClose: () => void }) {
  const { dispatch } = usePrototype()
  const relations = project.relations.filter((relation) => relation.from === concept.id || relation.to === concept.id)
  return (
    <aside className="concept-detail" aria-labelledby="concept-detail-title">
      <header><div><StatusBadge status={concept.state} /><h3 id="concept-detail-title">{concept.label}</h3></div><button type="button" className="icon-button" aria-label="关闭概念详情" onClick={onClose}><Icon name="close" size={17} /></button></header>
      <p>{concept.definition}</p>
      <section><span>直接关系</span><ul>{relations.map((relation) => { const otherId = relation.from === concept.id ? relation.to : relation.from; const other = project.concepts.find((entry) => entry.id === otherId); return <li key={relation.id}><strong>{relationLabels[relation.type]}</strong><span>{other?.label}</span><small>{relation.reason}</small></li> })}</ul></section>
      <section><span>学习证据</span><p>{project.evidence.filter((item) => item.conceptId === concept.id).length ? project.evidence.filter((item) => item.conceptId === concept.id)[0].summary : '还没有正式学习证据，当前状态是未验证。'}</p></section>
      <footer><button type="button" onClick={() => dispatch({ type: 'set_mode', mode: 'content' })}>回到正文</button><button type="button" onClick={() => dispatch({ type: 'open_chat', scope: 'concept', label: `概念 · ${concept.label}` })}><Icon name="chat" size={15} />询问 Agent</button><button type="button" onClick={() => dispatch({ type: 'open_source', anchorId: concept.sourceIds[0] })}><Icon name="source" size={15} />查看来源</button></footer>
    </aside>
  )
}

export function ConceptGraph({ project, chapterId }: { project: LearningProject; chapterId: string }) {
  const [scope, setScope] = useState<'chapter' | 'book'>('chapter')
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const concepts = useMemo(() => scope === 'book' ? project.concepts : project.concepts.filter((concept) => concept.chapterIds.includes(chapterId)), [chapterId, project.concepts, scope])
  const visibleIds = new Set(concepts.map((concept) => concept.id))
  const relations = project.relations.filter((relation) => visibleIds.has(relation.from) && visibleIds.has(relation.to))
  const selected = project.concepts.find((concept) => concept.id === selectedId) ?? null

  return (
    <section className="concept-mode" aria-labelledby="concept-mode-title">
      <header className="concept-mode__header">
        <div><p className="eyebrow">知识结构与学习状态</p><h2 id="concept-mode-title">概念图</h2><p>关系描述知识本身，节点状态来自正式学习证据，两者互不覆盖。</p></div>
        <div className="concept-controls"><div className="segmented"><button type="button" aria-pressed={scope === 'chapter'} onClick={() => setScope('chapter')}>当前章节</button><button type="button" aria-pressed={scope === 'book'} onClick={() => setScope('book')}>整本学习书</button></div><div className="icon-segmented"><button type="button" aria-label="图模式" aria-pressed={view === 'graph'} onClick={() => setView('graph')}><Icon name="map" size={17} /></button><button type="button" aria-label="列表模式" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" size={17} /></button></div></div>
      </header>
      <div className={selected ? 'concept-stage has-detail' : 'concept-stage'}>
        {view === 'graph' ? (
          <div className="concept-canvas" role="group" aria-label="概念关系图">
            <svg className="concept-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {relations.map((relation) => { const fromIndex = concepts.findIndex((concept) => concept.id === relation.from); const toIndex = concepts.findIndex((concept) => concept.id === relation.to); const from = positions[fromIndex % positions.length]; const to = positions[toIndex % positions.length]; return <line key={relation.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} /> })}
            </svg>
            {concepts.map((concept, index) => <button key={concept.id} type="button" className={`concept-node concept-node--${concept.state} ${selectedId === concept.id ? 'is-selected' : ''}`} style={{ left: `${positions[index % positions.length].x}%`, top: `${positions[index % positions.length].y}%` }} onClick={() => setSelectedId(concept.id)}><i aria-hidden="true" /><strong>{concept.label}</strong><small>{concept.state === 'mastered' ? '已掌握' : concept.state === 'review' ? '待复习' : concept.state === 'learning' ? '学习中' : '未验证'}</small></button>)}
            {relations.map((relation) => { const fromIndex = concepts.findIndex((concept) => concept.id === relation.from); const toIndex = concepts.findIndex((concept) => concept.id === relation.to); const from = positions[fromIndex % positions.length]; const to = positions[toIndex % positions.length]; return <span key={relation.id} className="relation-label" style={{ left: `${(from.x + to.x) / 2}%`, top: `${(from.y + to.y) / 2}%` }}>{relationLabels[relation.type]}</span> })}
          </div>
        ) : (
          <div className="concept-list" aria-label="概念列表替代视图">{concepts.map((concept) => <button key={concept.id} type="button" onClick={() => setSelectedId(concept.id)}><StatusBadge status={concept.state} /><span><strong>{concept.label}</strong><small>{concept.definition}</small></span><Icon name="chevron" size={16} /></button>)}</div>
        )}
        {selected && <ConceptDetail concept={selected} project={project} onClose={() => setSelectedId(null)} />}
      </div>
      <div className="graph-legend"><span><i className="legend-state legend-state--mastered" />已掌握</span><span><i className="legend-state legend-state--learning" />学习中</span><span><i className="legend-state legend-state--review" />待复习</span><span><i className="legend-state legend-state--unverified" />未验证</span><small>关系线均有明确类型与资料依据</small></div>
    </section>
  )
}
