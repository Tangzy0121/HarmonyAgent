import { describe, expect, it } from 'vitest'
import { deriveSuggestions } from './suggestions.js'
import type { StoredBook } from '../books/bookTypes.js'

const NOW = new Date(2026, 7, 17, 15, 0)
const DAY = 24 * 60 * 60 * 1000
const isoDaysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

function bookWithQuiz(id: string, title: string, overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id,
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount: 4, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title, description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [{
      id: 'ch-1',
      title: '第一章',
      order: 1,
      objective: '',
      coreConceptId: '',
      estimatedMinutes: 10,
      sourceAnchors: [],
      status: 'ready',
      blocks: [
        { id: 'cb1', type: 'concept', status: 'ready', title: '概念', revision: 1, sourceAnchors: [], concepts: [{ id: 'c1', label: '梯度下降', description: '', learningState: '暂无学习记录' }], relations: [] },
        { id: 'q1', type: 'quiz', status: 'ready', title: '练习', revision: 1, sourceAnchors: [], conceptId: 'c1', question: 'q', options: [{ id: 'a', marker: 'A', text: 'x' }], correctAnswerId: 'a', feedback: '' },
      ],
    }],
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    generationJobs: [],
    ...overrides,
  }
}

describe('deriveSuggestions', () => {
  it('悬崖概念优先，文案带书名与天数，带来源书 id', () => {
    const book = bookWithQuiz('book_a', '机器学习', {
      quizAttempts: [{ id: 'att1', chapterId: 'ch-1', blockId: 'q1', answerId: 'a', isCorrect: true, submittedAt: isoDaysAgo(10) }],
      reviewSchedule: { q1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: isoDaysAgo(2), updatedAt: isoDaysAgo(10) } },
    })
    const suggestions = deriveSuggestions([book], NOW)
    expect(suggestions[0]).toMatchObject({ kind: 'cliff', bookId: 'book_a', conceptLabel: '梯度下降' })
    expect(suggestions[0].text).toContain('机器学习')
    expect(suggestions[0].text).toContain('梯度下降')
    expect(suggestions[0].text).toContain('10 天')
  })

  it('无悬崖时薄弱概念（mastery<0.3）补位；最多 3 条', () => {
    const book = bookWithQuiz('book_a', '机器学习', {
      quizAttempts: [{ id: 'att1', chapterId: 'ch-1', blockId: 'q1', answerId: 'b', isCorrect: false, submittedAt: isoDaysAgo(1) }],
    })
    const suggestions = deriveSuggestions([book], NOW)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.length).toBeLessThanOrEqual(3)
    expect(suggestions[0]).toMatchObject({ kind: 'weak', bookId: 'book_a' })
  })

  it('无任何作答时给「继续读」最近更新的书；零书时返回空数组', () => {
    const book = bookWithQuiz('book_a', '机器学习', { updatedAt: isoDaysAgo(1) })
    const suggestions = deriveSuggestions([book], NOW)
    expect(suggestions).toEqual([
      expect.objectContaining({ kind: 'continue', bookId: 'book_a' }),
    ])
    expect(suggestions[0].text).toContain('机器学习')
    expect(deriveSuggestions([], NOW)).toEqual([])
  })
})
