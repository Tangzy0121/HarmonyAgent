import type { KnowledgeNode } from '../data/learningMap'
import type { ConceptItem, LearningBook, LearningEvidence, QuizAttempt } from '../types/learningBook'

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

// 掌握度公式与 server/src/books/mastery.ts 逐字对齐：
// 取该范围最近 5 次作答，按时间从近到远权重加权正确率；1 次封顶 0.5，2 次封顶 0.8，≥3 次不封顶。
export const MASTERY_WEIGHTS = [1, 0.95, 0.85, 0.7, 0.5] as const

type MasteryAttempt = Pick<QuizAttempt, 'isCorrect' | 'submittedAt'>

// submittedAt 降序；时间戳并列（同毫秒连续作答）时后追加的视为更近
function orderRecentFirst<T extends { submittedAt: string }>(attempts: T[]): T[] {
  return attempts
    .map((attempt, index) => ({ attempt, index }))
    .sort((a, b) => b.attempt.submittedAt.localeCompare(a.attempt.submittedAt) || b.index - a.index)
    .map(({ attempt }) => attempt)
}

export function computeMastery(attempts: MasteryAttempt[]): number {
  if (attempts.length === 0) return 0
  const recent = orderRecentFirst(attempts).slice(0, MASTERY_WEIGHTS.length)
  let weightedCorrect = 0
  let weightSum = 0
  for (const [position, attempt] of recent.entries()) {
    const weight = MASTERY_WEIGHTS[position]
    weightSum += weight
    if (attempt.isCorrect) weightedCorrect += weight
  }
  const cap = recent.length === 1 ? 0.5 : recent.length === 2 ? 0.8 : 1
  // 修约到 6 位小数，消除浮点尘埃，保证返回值稳定可比
  return Math.round(Math.min(weightedCorrect / weightSum, cap) * 1e6) / 1e6
}

/** 章节掌握度：该章有 attempts 时返回 0..1，否则返回 null（不展示）。 */
export function chapterMastery(book: LearningBook, chapterId: string): number | null {
  const attempts = book.quizAttempts.filter((attempt) => attempt.chapterId === chapterId)
  return attempts.length === 0 ? null : computeMastery(attempts)
}

/** 某 quiz 块的最近一次作答（多次作答时取最新）。 */
export function latestAttemptForBlock(attempts: QuizAttempt[], blockId: string): QuizAttempt | undefined {
  return orderRecentFirst(attempts.filter((attempt) => attempt.blockId === blockId))[0]
}

/** 某 quiz 块的最新一条学习证据。 */
export function latestEvidenceForBlock(evidence: LearningEvidence[], blockId: string): LearningEvidence | undefined {
  const matches = evidence.filter((item) => item.sourceBlockId === blockId)
  return matches
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.createdAt.localeCompare(a.item.createdAt) || b.index - a.index)
    .map(({ item }) => item)[0]
}

/**
 * 概念学习状态派生（客户端从 attempts 派生，不改服务端块数据）：
 * 无作答 → '暂无学习记录'；最近一次答错 → '待复习'；其余 → '已学习'。
 */
export function deriveConceptLearningState(book: LearningBook, conceptId: string): ConceptItem['learningState'] {
  const blockIds = new Set(
    book.chapters
      .flatMap((chapter) => chapter.blocks)
      .filter((block) => block.type === 'quiz' && block.conceptId === conceptId)
      .map((block) => block.id),
  )
  const latest = orderRecentFirst(book.quizAttempts.filter((attempt) => blockIds.has(attempt.blockId)))[0]
  if (!latest) return '暂无学习记录'
  return latest.isCorrect ? '已学习' : '待复习'
}
