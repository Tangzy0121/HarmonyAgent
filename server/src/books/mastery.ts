// 掌握度纯函数：取该范围最近 5 次作答，按时间从近到远权重加权正确率；
// 作答 1 次封顶 0.5，2 次封顶 0.8，≥3 次不封顶。空数组返回 0。

export const MASTERY_WEIGHTS = [1, 0.95, 0.85, 0.7, 0.5] as const

export interface MasteryAttempt {
  isCorrect: boolean
  submittedAt: string
}

export function computeMastery(attempts: MasteryAttempt[]): number {
  if (attempts.length === 0) return 0
  // submittedAt 降序取前 5；时间戳并列（同毫秒连续作答）时后追加的视为更近
  const recent = attempts
    .map((attempt, index) => ({ attempt, index }))
    .sort((a, b) => b.attempt.submittedAt.localeCompare(a.attempt.submittedAt) || b.index - a.index)
    .slice(0, MASTERY_WEIGHTS.length)
  let weightedCorrect = 0
  let weightSum = 0
  for (const [position, { attempt }] of recent.entries()) {
    const weight = MASTERY_WEIGHTS[position]
    weightSum += weight
    if (attempt.isCorrect) weightedCorrect += weight
  }
  const cap = recent.length === 1 ? 0.5 : recent.length === 2 ? 0.8 : 1
  // 修约到 6 位小数，消除浮点尘埃，保证返回值稳定可比
  return Math.round(Math.min(weightedCorrect / weightSum, cap) * 1e6) / 1e6
}
