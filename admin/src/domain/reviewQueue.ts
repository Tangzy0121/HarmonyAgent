import { latestAttemptForBlock } from './learningProjection'
import type { LearningBook } from '../types/learningBook'

export interface ReviewQueueItem {
  chapterId: string
  blockId: string
  question: string
}

/**
 * 错题复习队列：按块分组取最近一次作答，最近一次答错的块入队，
 * 按该次作答时间升序（最早答错的排最前）。答对后（最近一次为对）自动出队。
 * 队列从书中仍存在的 quiz 块派生，已删除块的遗留 attempt 忽略。
 */
export function buildReviewQueue(book: LearningBook): ReviewQueueItem[] {
  const wrong: Array<ReviewQueueItem & { submittedAt: string }> = []
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) {
      if (block.type !== 'quiz') continue
      const latest = latestAttemptForBlock(book.quizAttempts, block.id)
      if (!latest || latest.isCorrect) continue
      wrong.push({ chapterId: chapter.id, blockId: block.id, question: block.question, submittedAt: latest.submittedAt })
    }
  }
  return wrong
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .map(({ chapterId, blockId, question }) => ({ chapterId, blockId, question }))
}
