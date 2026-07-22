import type { KnowledgeNode } from '../data/learningMap'
import { Icon } from './Icon'

interface NodeDetailPanelProps {
  node: KnowledgeNode
  relatedCount: number
  onClose: () => void
}

const categoryLabels = {
  method: '方法',
  theory: '理论',
  practice: '实践',
  application: '应用',
} as const

export function NodeDetailPanel({ node, relatedCount, onClose }: NodeDetailPanelProps) {
  return (
    <aside className="node-detail-panel" aria-label={`${node.label}详情`}>
      <div className="node-detail-panel__grip" aria-hidden="true" />
      <div className="node-detail-panel__heading">
        <div>
          <p>{categoryLabels[node.category]} · {node.learningState}</p>
          <h2>{node.label}</h2>
        </div>
        <button type="button" aria-label="关闭节点详情" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <p className="node-detail-panel__summary">{node.summary}</p>
      <div className="node-detail-panel__footer">
        <span>关联 {relatedCount} 个主题</span>
        <div>
          <button type="button">相关资料</button>
          <button className="node-detail-panel__primary" type="button">继续学习 <Icon name="arrow" size={16} /></button>
        </div>
      </div>
    </aside>
  )
}
