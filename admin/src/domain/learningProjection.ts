import type { KnowledgeNode } from '../data/learningMap'
import type { LearningEvidence } from '../types/learningBook'

export function projectLearningEvidence(nodes: KnowledgeNode[], evidence: LearningEvidence[]): KnowledgeNode[] {
  const latestOutcomeByConcept = new Map(evidence.map((item) => [item.conceptId, item.outcome]))
  return nodes.map((node) => {
    const outcome = latestOutcomeByConcept.get(node.id)
    if (!outcome) return node
    return {
      ...node,
      learningState: outcome === 'mastered' ? '已掌握' : '待复习',
    }
  })
}
