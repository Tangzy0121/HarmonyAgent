import type { ReviewKind, ReviewScheduleEntry, StoredBook } from './bookTypes.js'

export const REVIEW_INTERVALS_DAYS: Record<ReviewKind, readonly number[]> = {
  quiz: [1, 4, 10],
  flash_cards: [1, 3, 7, 16, 35],
}

const DAY_MS = 24 * 60 * 60 * 1000

export interface DueItem {
  blockId: string
  chapterId: string
  kind: ReviewKind
  title: string
  dueAt: string
  stage: number
  lapses: number
}

/**
 * 复习调度：remembered=false → 重置到 stage 0、当天到期、lapses+1；
 * remembered=true → 未入调度的 quiz 块不入队（从未答错），其余按 intervals[stage]
 * 推进；stage 已走完序列则毕业（返回 null）。
 */
export function applyReviewGrade(
  entry: ReviewScheduleEntry | undefined,
  kind: ReviewKind,
  remembered: boolean,
  now: Date,
): ReviewScheduleEntry | null {
  const updatedAt = now.toISOString()
  if (!remembered) {
    return { kind, stage: 0, lapses: (entry?.lapses ?? 0) + 1, dueAt: updatedAt, updatedAt }
  }
  if (entry === undefined) {
    if (kind === 'quiz') return null
    const intervals = REVIEW_INTERVALS_DAYS[kind]
    return { kind, stage: 1, lapses: 0, dueAt: new Date(now.getTime() + intervals[0] * DAY_MS).toISOString(), updatedAt }
  }
  const intervals = REVIEW_INTERVALS_DAYS[kind]
  if (entry.stage >= intervals.length) return null
  return {
    kind,
    stage: entry.stage + 1,
    lapses: entry.lapses,
    dueAt: new Date(now.getTime() + intervals[entry.stage] * DAY_MS).toISOString(),
    updatedAt,
  }
}

/** 到期复习项：dueAt <= now 且块仍存在，按 dueAt 升序。 */
export function listDueItems(book: StoredBook, now: Date): DueItem[] {
  const schedule = book.reviewSchedule ?? {}
  const due: DueItem[] = []
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) {
      if (block.type !== 'quiz' && block.type !== 'flash_cards') continue
      const entry = schedule[block.id]
      if (!entry || entry.dueAt > now.toISOString()) continue
      due.push({ blockId: block.id, chapterId: chapter.id, kind: entry.kind, title: block.title, dueAt: entry.dueAt, stage: entry.stage, lapses: entry.lapses })
    }
  }
  return due.sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}
