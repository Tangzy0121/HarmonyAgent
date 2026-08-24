// 阅读进度与完成度：纯函数，零 LLM。
// 完成度 = 0.4×已读章节占比 + 0.6×有记录概念掌握均值（无记录概念不参与）。
// 薄弱章节 = 章内有记录概念掌握均值 < 0.5，升序取前 3。

import { computeMastery } from './mastery.js'
import type { ReadingProgress, StoredBook } from './bookTypes.js'

export type ProgressAction = 'visit' | 'bookmark' | 'unbookmark'

export interface ProgressEvent {
  chapterId: string
  action: ProgressAction
}

export interface WeakChapter {
  chapterId: string
  title: string
  mastery: number
}

export interface BookCompletion {
  completionScore: number
  visitedCount: number
  totalChapters: number
  weakChapters: WeakChapter[]
}

const VISITED_WEIGHT = 0.4
const MASTERY_WEIGHT = 0.6
const WEAK_THRESHOLD = 0.5
const WEAK_LIMIT = 3

function emptyProgress(): ReadingProgress {
  return { visitedChapterIds: [], bookmarkedChapterIds: [], lastReadAt: {} }
}

/** 幂等应用一条进度事件；存量书无 readingProgress 时自动初始化 */
export function applyProgressEvent(book: StoredBook, event: ProgressEvent, nowIso: string): ReadingProgress {
  const progress = book.readingProgress ?? emptyProgress()
  book.readingProgress = progress
  switch (event.action) {
    case 'visit':
      if (!progress.visitedChapterIds.includes(event.chapterId)) {
        progress.visitedChapterIds.push(event.chapterId)
      }
      progress.lastReadAt[event.chapterId] = nowIso
      break
    case 'bookmark':
      if (!progress.bookmarkedChapterIds.includes(event.chapterId)) {
        progress.bookmarkedChapterIds.push(event.chapterId)
      }
      break
    case 'unbookmark':
      progress.bookmarkedChapterIds = progress.bookmarkedChapterIds.filter((id) => id !== event.chapterId)
      break
  }
  return progress
}

/** 章内各概念（有记录）掌握度列表；归因规则镜像 masteryBoard：conceptId 空串只算自身块 */
function chapterConceptMasteries(book: StoredBook, chapterId: string): number[] {
  const chapter = book.chapters.find((entry) => entry.id === chapterId)
  if (!chapter) return []
  const masteries: number[] = []
  for (const block of chapter.blocks) {
    if (block.type !== 'concept') continue
    for (const concept of block.concepts) {
      if (concept.id === '') continue
      const quizBlockIds = new Set(
        book.chapters
          .flatMap((entry) => entry.blocks)
          .filter((entry) => entry.type === 'quiz' && entry.conceptId === concept.id)
          .map((entry) => entry.id),
      )
      const attempts = book.quizAttempts.filter((attempt) => quizBlockIds.has(attempt.blockId))
      if (attempts.length === 0) continue
      masteries.push(computeMastery(attempts))
    }
  }
  return masteries
}

export function deriveCompletion(book: StoredBook): BookCompletion {
  const totalChapters = book.chapters.length
  const chapterIds = new Set(book.chapters.map((chapter) => chapter.id))
  const visitedCount = (book.readingProgress?.visitedChapterIds ?? []).filter((id) => chapterIds.has(id)).length

  const allMasteries = book.chapters.flatMap((chapter) => chapterConceptMasteries(book, chapter.id))
  const avgMastery = allMasteries.length === 0
    ? 0
    : allMasteries.reduce((sum, value) => sum + value, 0) / allMasteries.length

  const completionScore = totalChapters === 0
    ? 0
    : Math.round((VISITED_WEIGHT * (visitedCount / totalChapters) + MASTERY_WEIGHT * avgMastery) * 1e6) / 1e6

  const weakChapters = book.chapters
    .map((chapter) => {
      const masteries = chapterConceptMasteries(book, chapter.id)
      const mastery = masteries.length === 0
        ? null
        : masteries.reduce((sum, value) => sum + value, 0) / masteries.length
      return mastery !== null && mastery < WEAK_THRESHOLD
        ? { chapterId: chapter.id, title: chapter.title, mastery: Math.round(mastery * 1e6) / 1e6 }
        : null
    })
    .filter((entry): entry is WeakChapter => entry !== null)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, WEAK_LIMIT)

  return { completionScore, visitedCount, totalChapters, weakChapters }
}
