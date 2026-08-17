import type { KnowledgeNode, KnowledgeRelationship } from '../data/learningMap'
import type { ConceptItem, LearningBook } from '../types/learningBook'

export interface BookMapProjection {
  nodes: KnowledgeNode[]
  relationships: KnowledgeRelationship[]
}

// 画布中心与 learningMapSize (1120×940) 对齐
const CENTER_X = 560
const CENTER_Y = 470
const CLUSTER_RADIUS_X = 330
const CLUSTER_RADIUS_Y = 300
const RING_RADIUS = 110

/** 归一化概念名：trim + 小写 + 全角折半角（与 server/src/learning/learnerProfile.ts 同规则） */
export function normalizeConceptLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
}

interface ConceptSourceRef {
  book: LearningBook
  chapterId: string
  coreConceptId: string
  concept: ConceptItem
  /** 该来源书内此概念的最新 evidence outcome 与时间 */
  latestOutcome: 'mastered' | 'review' | null
  latestOutcomeAt: string
}

interface ConceptGroup {
  key: string
  concept: ConceptItem
  sources: ConceptSourceRef[]
  /** 证据最多的来源簇（合并节点挂到这里） */
  primaryCluster: string
}

function latestOutcomeOf(book: LearningBook, conceptId: string): { outcome: 'mastered' | 'review' | null; at: string } {
  let outcome: 'mastered' | 'review' | null = null
  let at = ''
  for (const item of book.evidence) {
    if (item.conceptId !== conceptId) continue
    if (outcome === null || item.createdAt >= at) {
      outcome = item.outcome
      at = item.createdAt
    }
  }
  return { outcome, at }
}

/**
 * 把真实学习书投影为知识地图数据（学习者模型规格 §3.1）：
 * 章 = 主题簇（布局上聚成一簇）；跨书同名概念按归一化 label 合并为一个节点，
 * 学习状态由聚合 evidence 推导（节点存在 ≠ 已学习）；候选/已确认关系 = 边（已拒绝不进图）。
 * 无真实书概念时返回空，由页面回退 mock 演示图。
 */
export function projectBooksToMap(books: LearningBook[]): BookMapProjection {
  // 1) 收集概念并按归一化 label 分组
  const groups = new Map<string, ConceptGroup & { clusterId: string }>()
  const clusterOrder: string[] = []
  for (const book of books) {
    const chapters = [...book.chapters].sort((a, b) => a.order - b.order)
    for (const chapter of chapters) {
      const conceptBlocks = chapter.blocks.filter((block) => block.type === 'concept')
      if (conceptBlocks.length === 0) continue
      const clusterId = `${book.id}/${chapter.id}`
      if (!clusterOrder.includes(clusterId)) clusterOrder.push(clusterId)
      for (const concept of conceptBlocks.flatMap((block) => block.concepts)) {
        const key = normalizeConceptLabel(concept.label)
        const { outcome, at } = latestOutcomeOf(book, concept.id)
        const source: ConceptSourceRef = {
          book,
          chapterId: chapter.id,
          coreConceptId: chapter.coreConceptId,
          concept,
          latestOutcome: outcome,
          latestOutcomeAt: at,
        }
        const existing = groups.get(key)
        if (existing) {
          existing.sources.push(source)
          // 主簇 = 证据数多的来源；平手保留先出现的
          const existingEvidence = existing.sources[0].book.evidence.filter((item) => item.conceptId === existing.sources[0].concept.id).length
          const candidateEvidence = book.evidence.filter((item) => item.conceptId === concept.id).length
          if (candidateEvidence > existingEvidence) {
            existing.clusterId = clusterId
            existing.concept = concept
            existing.sources.unshift(existing.sources.pop()!)
          }
        } else {
          groups.set(key, { key, concept, sources: [source], primaryCluster: clusterId, clusterId })
        }
      }
    }
  }
  if (groups.size === 0) return { nodes: [], relationships: [] }

  // 只保留真正有节点落位的簇
  const usedClusters = [...new Set([...groups.values()].map((group) => group.clusterId))]

  // 2) 布局：簇环 + 簇内环
  const nodes: KnowledgeNode[] = []
  const grouped = [...groups.values()]
  usedClusters.forEach((clusterId, clusterIndex) => {
    const theta = usedClusters.length === 1 ? null : -Math.PI / 2 + (2 * Math.PI * clusterIndex) / usedClusters.length
    const centerX = theta === null ? CENTER_X : Math.round(CENTER_X + CLUSTER_RADIUS_X * Math.cos(theta))
    const centerY = theta === null ? CENTER_Y : Math.round(CENTER_Y + CLUSTER_RADIUS_Y * Math.sin(theta))

    const members = grouped.filter((group) => group.clusterId === clusterId)
    // 核心概念（主簇章的 coreConceptId 命中的组）排中心，其余按 key 排序围环
    const core = members.find((group) => group.sources.some((source) => source.chapterId === clusterId.split('/')[1] && source.coreConceptId === source.concept.id))
    const ordered = [...members].sort((a, b) => {
      if (a === core) return -1
      if (b === core) return 1
      return a.key.localeCompare(b.key)
    })
    const auxCount = ordered.length - 1

    ordered.forEach((group, index) => {
      const isCore = index === 0 && core !== undefined
      const ringTheta = auxCount <= 0 ? 0 : -Math.PI / 2 + (2 * Math.PI * (index - 1)) / auxCount
      // 学习状态：全部来源的最新 outcome 聚合（规格：状态由 evidence 推导）
      const latest = group.sources.reduce<ConceptSourceRef | null>(
        (acc, source) => (acc === null || source.latestOutcomeAt >= acc.latestOutcomeAt ? source : acc),
        null,
      )
      const learningState: KnowledgeNode['learningState'] = latest?.latestOutcome === 'mastered'
        ? '已掌握'
        : latest?.latestOutcome === 'review'
          ? '待复习'
          : '暂无学习记录'
      nodes.push({
        id: `label:${group.key}`,
        label: group.concept.label.trim(),
        category: 'theory',
        x: isCore ? centerX : Math.round(centerX + RING_RADIUS * Math.cos(ringTheta)),
        y: isCore ? centerY : Math.round(centerY + RING_RADIUS * Math.sin(ringTheta)),
        size: isCore ? 'medium' : 'small',
        learningState,
        summary: group.concept.description,
      })
    })
  })

  // 3) 边：全部来源的候选/已确认关系，端点映射到合并节点
  const relationships: KnowledgeRelationship[] = []
  const nodeIds = new Set(nodes.map((node) => node.id))
  const labelByConceptId = new Map<string, string>()
  for (const group of grouped) {
    for (const source of group.sources) {
      labelByConceptId.set(`${source.book.id}:${source.concept.id}`, `label:${group.key}`)
    }
  }
  for (const book of books) {
    for (const chapter of book.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'concept') continue
        const labelOf = (conceptId: string) => labelByConceptId.get(`${book.id}:${conceptId}`)
        for (const relation of block.relations) {
          if (relation.status === '已拒绝') continue
          const from = labelOf(relation.sourceId)
          const to = labelOf(relation.targetId)
          if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) continue
          if (relationships.some((existing) => existing.from === from && existing.to === to)) continue
          relationships.push({ from, to })
        }
      }
    }
  }

  return { nodes, relationships }
}
