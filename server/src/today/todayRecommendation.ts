// 今日推荐：确定性派生（零 LLM），合同见 docs/server/functions-and-roadmap.md PR-C。
// 优先级：到期复习 > 遗忘悬崖 > 薄弱巩固 > 继续阅读；同优先级按最近学习降序、bookId 字典序兜底。

import { deriveLearnerProfile, normalizeConceptLabel } from '../learning/learnerProfile.js'
import { deriveCompletion } from '../books/readingProgress.js'
import { buildProjectDto } from '../projects/projectMapper.js'
import type { StoredBook } from '../books/bookTypes.js'

export type TodayAction = 'review_due' | 'review_cliff' | 'review_weak' | 'continue_reading'
export type TodayState = 'active' | 'dismissed' | 'snoozed' | 'completed'

export interface TodayRecommendationDto {
  version: '1'
  /** 按日确定：rec_<yyyymmdd>_<action>_<bookId>[_<concept>]，状态每日自然重置 */
  id: string
  action: TodayAction
  bookId: string
  conceptLabel: string | null
  reason: string
  /** 参与排序的块/概念引用 */
  evidenceRefs: string[]
  estimatedMinutes: number
  /** 次日 00:00（服务器本地时区） */
  expiresAt: string
  rank: 'primary' | 'alternative'
  state: TodayState
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEAK_THRESHOLD = 0.3
const ALTERNATIVES_LIMIT = 2

function dayKey(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function nextMidnight(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
}

function recommendationId(action: TodayAction, bookId: string, conceptLabel?: string): string {
  return conceptLabel === undefined
    ? `rec_${action}_${bookId}`
    : `rec_${action}_${bookId}_${normalizeConceptLabel(conceptLabel).replace(/\s+/g, '_')}`
}

function lastLearnedMs(book: StoredBook): number {
  const dto = buildProjectDto(book, { userId: '', workspaceId: '' })
  return Date.parse(dto.lastLearnedAt ?? dto.createdAt)
}

/** 按书聚合到期复习项 */
function dueReviewRecommendations(books: StoredBook[], now: Date): TodayRecommendationDto[] {
  const nowMs = now.getTime()
  return books
    .map((book): TodayRecommendationDto | null => {
      const due = Object.entries(book.reviewSchedule ?? {})
        .filter(([, entry]) => Date.parse(entry.dueAt) <= nowMs)
        .map(([blockId]) => blockId)
        .sort()
      if (due.length === 0) return null
      return {
        version: '1' as const,
        id: recommendationId('review_due', book.id),
        action: 'review_due' as const,
        bookId: book.id,
        conceptLabel: null,
        reason: `《${book.proposal.title}》有 ${due.length} 个概念到期该复习了`,
        evidenceRefs: due,
        estimatedMinutes: Math.min(5 * due.length, 15),
        expiresAt: nextMidnight(now),
        rank: 'primary' as const,
        state: 'active' as const,
      }
    })
    .filter((item): item is TodayRecommendationDto => item !== null)
    .sort((a, b) => {
      const byCount = b.evidenceRefs.length - a.evidenceRefs.length
      if (byCount !== 0) return byCount
      return a.bookId.localeCompare(b.bookId)
    })
}

function conceptRecommendations(
  books: StoredBook[],
  now: Date,
  action: 'review_cliff' | 'review_weak',
): TodayRecommendationDto[] {
  const profile = deriveLearnerProfile(books, now)
  const titleByBookId = new Map(books.map((book) => [book.id, book.proposal.title]))
  const seen = new Set<string>()
  const result: TodayRecommendationDto[] = []
  for (const concept of profile.concepts) {
    const isCliff = concept.forgettingCliff
    const isWeak = concept.attempts > 0 && concept.mastery < WEAK_THRESHOLD
    if ((action === 'review_cliff') !== isCliff) continue
    if (action === 'review_weak' && !isWeak) continue
    if (seen.has(concept.label)) continue
    seen.add(concept.label)
    const bookId = concept.sources[0]?.bookId
    if (!bookId) continue
    const idleDays = concept.lastAttemptAt
      ? Math.floor((now.getTime() - Date.parse(concept.lastAttemptAt)) / DAY_MS)
      : 0
    result.push({
      version: '1',
      id: recommendationId(action, bookId, concept.label),
      action,
      bookId,
      conceptLabel: concept.displayLabel,
      reason: action === 'review_cliff'
        ? `《${titleByBookId.get(bookId) ?? ''}》的「${concept.displayLabel}」已经 ${idleDays} 天没碰了，快遗忘了`
        : `《${titleByBookId.get(bookId) ?? ''}》的「${concept.displayLabel}」掌握度还比较低，巩固一下`,
      evidenceRefs: [concept.label],
      estimatedMinutes: 10,
      expiresAt: nextMidnight(now),
      rank: 'primary',
      state: 'active',
    })
  }
  return result
}

/** 进行中：有可读章节且未完成（completion<1）或仍有待生成章节 */
function continueReadingRecommendations(books: StoredBook[], now: Date): TodayRecommendationDto[] {
  return books
    .filter((book) => {
      const ready = book.chapters.filter((chapter) => chapter.status === 'ready')
      if (ready.length === 0) return false
      const hasPending = book.chapters.some((chapter) =>
        chapter.status === 'pending' || chapter.status === 'generating')
      return hasPending || deriveCompletion(book).completionScore < 1
    })
    .map((book) => {
      const next = book.chapters.find((chapter) => chapter.status === 'ready' &&
        !(book.readingProgress?.visitedChapterIds ?? []).includes(chapter.id))
      return {
        version: '1' as const,
        id: recommendationId('continue_reading', book.id),
        action: 'continue_reading' as const,
        bookId: book.id,
        conceptLabel: null,
        reason: `继续读《${book.proposal.title}》，接着上次的进度`,
        evidenceRefs: [book.activeChapterId],
        estimatedMinutes: next?.estimatedMinutes ?? 15,
        expiresAt: nextMidnight(now),
        rank: 'primary' as const,
        state: 'active' as const,
      }
    })
    .sort((a, b) => {
      const byRecency = lastLearnedMs(books.find((book) => book.id === b.bookId)!) -
        lastLearnedMs(books.find((book) => book.id === a.bookId)!)
      if (byRecency !== 0) return byRecency
      return a.bookId.localeCompare(b.bookId)
    })
}

/**
 * 派生今日推荐（不含状态叠加）。返回 [primary, ...alternatives]，无可推荐为空数组。
 * 确定性：同输入同输出。
 */
export function deriveTodayRecommendations(
  books: StoredBook[],
  now: Date = new Date(),
): TodayRecommendationDto[] {
  const ranked = [
    ...dueReviewRecommendations(books, now),
    ...conceptRecommendations(books, now, 'review_cliff'),
    ...conceptRecommendations(books, now, 'review_weak'),
    ...continueReadingRecommendations(books, now),
  ]
  return ranked.slice(0, 1 + ALTERNATIVES_LIMIT).map((item, index) => ({
    ...item,
    id: item.id.replace('rec_', `rec_${dayKey(now)}_`),
    rank: index === 0 ? 'primary' : 'alternative',
  }))
}
