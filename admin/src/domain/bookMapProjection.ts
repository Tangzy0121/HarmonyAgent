import type { KnowledgeNode, KnowledgeRelationship } from '../data/learningMap'
import type { ConceptBlock, LearningBook } from '../types/learningBook'

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

interface ClusterSource {
  book: LearningBook
  chapterId: string
  coreConceptId: string
  block: ConceptBlock
}

function collectClusters(books: LearningBook[]): ClusterSource[] {
  const clusters: ClusterSource[] = []
  for (const book of books) {
    const chapters = [...book.chapters].sort((a, b) => a.order - b.order)
    for (const chapter of chapters) {
      // 一章可有多个 concept 块：概念与关系按章聚合，核心概念取章的 coreConceptId
      const blocks = chapter.blocks.filter((block): block is ConceptBlock => block.type === 'concept')
      if (blocks.length === 0) continue
      clusters.push({
        book,
        chapterId: chapter.id,
        coreConceptId: chapter.coreConceptId,
        block: {
          id: blocks[0].id,
          type: 'concept',
          status: blocks[0].status,
          title: blocks[0].title,
          revision: blocks[0].revision,
          sourceAnchors: blocks.flatMap((block) => block.sourceAnchors),
          concepts: blocks.flatMap((block) => block.concepts),
          relations: blocks.flatMap((block) => block.relations),
        },
      })
    }
  }
  return clusters
}

/** 概念学习状态：取该概念最新一条 evidence 的 outcome；无证据 → 暂无学习记录（规格 §9：节点存在 ≠ 已学习）。 */
function learningStateFor(book: LearningBook, conceptId: string): KnowledgeNode['learningState'] {
  let latest: 'mastered' | 'review' | null = null
  let latestAt = ''
  for (const item of book.evidence) {
    if (item.conceptId !== conceptId) continue
    if (latest === null || item.createdAt >= latestAt) {
      latest = item.outcome
      latestAt = item.createdAt
    }
  }
  if (latest === 'mastered') return '已掌握'
  if (latest === 'review') return '待复习'
  return '暂无学习记录'
}

/**
 * 把真实学习书投影为知识地图数据：
 * 章 = 主题簇（布局上聚成一簇），concept 块的概念 = 知识节点（id 以 bookId 前缀限定作用域），
 * 候选/已确认关系 = 边（已拒绝的不进图）。无真实书时返回空，由页面回退到 mock 演示图。
 */
export function projectBooksToMap(books: LearningBook[]): BookMapProjection {
  const clusters = collectClusters(books)
  if (clusters.length === 0) return { nodes: [], relationships: [] }

  const nodes: KnowledgeNode[] = []
  const relationships: KnowledgeRelationship[] = []
  const nodeIds = new Set<string>()

  clusters.forEach((cluster, clusterIndex) => {
    const clusterTheta = clusters.length === 1
      ? null
      : -Math.PI / 2 + (2 * Math.PI * clusterIndex) / clusters.length
    const centerX = clusterTheta === null ? CENTER_X : Math.round(CENTER_X + CLUSTER_RADIUS_X * Math.cos(clusterTheta))
    const centerY = clusterTheta === null ? CENTER_Y : Math.round(CENTER_Y + CLUSTER_RADIUS_Y * Math.sin(clusterTheta))

    const concepts = cluster.block.concepts
    const coreId = concepts.some((concept) => concept.id === cluster.coreConceptId)
      ? cluster.coreConceptId
      : concepts[0].id
    const ordered = [...concepts].sort((a, b) => (a.id === coreId ? -1 : b.id === coreId ? 1 : 0))
    const auxCount = ordered.length - 1

    ordered.forEach((concept, index) => {
      const nodeId = `${cluster.book.id}:${concept.id}`
      nodeIds.add(nodeId)
      const isCore = index === 0
      const ringTheta = auxCount === 0 ? 0 : -Math.PI / 2 + (2 * Math.PI * (index - 1)) / auxCount
      nodes.push({
        id: nodeId,
        label: concept.label,
        category: 'theory',
        x: isCore ? centerX : Math.round(centerX + RING_RADIUS * Math.cos(ringTheta)),
        y: isCore ? centerY : Math.round(centerY + RING_RADIUS * Math.sin(ringTheta)),
        size: isCore ? 'medium' : 'small',
        learningState: learningStateFor(cluster.book, concept.id),
        summary: concept.description,
      })
    })

    for (const relation of cluster.block.relations) {
      if (relation.status === '已拒绝') continue
      const from = `${cluster.book.id}:${relation.sourceId}`
      const to = `${cluster.book.id}:${relation.targetId}`
      if (!nodeIds.has(from) || !nodeIds.has(to)) continue
      if (relationships.some((existing) => existing.from === from && existing.to === to)) continue
      relationships.push({ from, to })
    }
  })

  return { nodes, relationships }
}
