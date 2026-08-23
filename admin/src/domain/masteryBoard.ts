import { computeMastery } from './learningProjection'
import type { LearningBook } from '../types/learningBook'

export type MasteryState = '未学' | '起步' | '掌握中' | '已掌握' | '待复习'

export interface MasteryBoardRow {
  chapterId: string
  chapterTitle: string
  conceptId: string
  label: string
  mastery: number
  state: MasteryState
  blockId: string
}

/** concept 关联的 quiz 块（镜像 server：conceptId 为空串只算自身块） */
function conceptQuizBlockIds(book: LearningBook, conceptId: string, fallbackBlockId: string): Set<string> {
  if (conceptId === '') return new Set([fallbackBlockId])
  return new Set(
    book.chapters
      .flatMap((chapter) => chapter.blocks)
      .filter((block) => block.type === 'quiz' && block.conceptId === conceptId)
      .map((block) => block.id),
  )
}

export function buildMasteryBoard(book: LearningBook, now: Date): MasteryBoardRow[] {
  const rows: MasteryBoardRow[] = []
  const schedule = book.reviewSchedule ?? {}
  const nowIso = now.toISOString()
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) {
      if (block.type !== 'concept') continue
      for (const concept of block.concepts) {
        // 空串 conceptId 无关联 quiz 可归因，行恒为未学/0%，不进看板
        if (concept.id === '') continue
        const blockIds = conceptQuizBlockIds(book, concept.id, block.id)
        const attempts = book.quizAttempts.filter((attempt) => blockIds.has(attempt.blockId))
        const mastery = computeMastery(attempts)
        const due = [...blockIds].some((id) => (schedule[id]?.dueAt ?? '9999') <= nowIso)
        const state: MasteryState =
          attempts.length === 0 ? '未学'
          : due ? '待复习'
          : mastery >= 0.8 ? '已掌握'
          : mastery >= 0.5 ? '掌握中'
          : '起步'
        rows.push({ chapterId: chapter.id, chapterTitle: chapter.title, conceptId: concept.id, label: concept.label, mastery, state, blockId: block.id })
      }
    }
  }
  return rows
}
