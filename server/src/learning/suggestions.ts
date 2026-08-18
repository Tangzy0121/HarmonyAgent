// starter 建议：从学习者画像派生的模板化建议，零 LLM。
// 优先级：遗忘悬崖 > 薄弱（mastery<0.3）> 继续读最近书；最多 3 条。

import { deriveLearnerProfile } from './learnerProfile.js'
import type { StoredBook } from '../books/bookTypes.js'

export interface LearnerSuggestion {
  kind: 'cliff' | 'weak' | 'continue'
  text: string
  bookId: string | null
  conceptLabel: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const SUGGESTION_LIMIT = 3
const WEAK_THRESHOLD = 0.3

export function deriveSuggestions(books: StoredBook[], now: Date = new Date()): LearnerSuggestion[] {
  const suggestions: LearnerSuggestion[] = []
  const titleByBookId = new Map(books.map((book) => [book.id, book.proposal.title]))
  const profile = deriveLearnerProfile(books, now)

  const seenLabels = new Set<string>()
  const pushConcept = (kind: 'cliff' | 'weak', label: string, displayLabel: string, bookId: string | null, idleDays: number | null) => {
    if (suggestions.length >= SUGGESTION_LIMIT || seenLabels.has(label)) return
    seenLabels.add(label)
    const bookTitle = bookId ? titleByBookId.get(bookId) ?? '' : ''
    const where = bookTitle ? `《${bookTitle}》` : ''
    suggestions.push({
      kind,
      text: kind === 'cliff'
        ? `复习${where}·「${displayLabel}」，已经 ${idleDays ?? 0} 天没碰了`
        : `巩固${where}·「${displayLabel}」，掌握度还比较低`,
      bookId,
      conceptLabel: displayLabel,
    })
  }

  // profile.concepts 已按 悬崖优先 + mastery 升序 排好
  for (const concept of profile.concepts) {
    if (!concept.forgettingCliff) continue
    const idleDays = concept.lastAttemptAt
      ? Math.floor((now.getTime() - new Date(concept.lastAttemptAt).getTime()) / DAY_MS)
      : null
    pushConcept('cliff', concept.label, concept.displayLabel, concept.sources[0]?.bookId ?? null, idleDays)
  }
  for (const concept of profile.concepts) {
    if (concept.attempts === 0 || concept.mastery >= WEAK_THRESHOLD) continue
    pushConcept('weak', concept.label, concept.displayLabel, concept.sources[0]?.bookId ?? null, null)
  }

  if (suggestions.length === 0 && books.length > 0) {
    const recent = [...books].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    suggestions.push({
      kind: 'continue',
      text: `继续读《${recent.proposal.title}》，接着上次的进度`,
      bookId: recent.id,
      conceptLabel: null,
    })
  }

  return suggestions
}
