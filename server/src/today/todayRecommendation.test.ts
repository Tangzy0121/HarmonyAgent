import { describe, expect, it } from 'vitest'

import type { StoredBook } from '../books/bookTypes.js'
import { deriveTodayRecommendations } from './todayRecommendation.js'

const NOW = new Date('2026-08-15T10:00:00.000Z')

function seedBook(id: string, overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id,
    source: { id: `doc_${id}`, fileName: 'a.pdf', format: 'PDF', pageCount: 4, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: `书 ${id}`, description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [
      { id: 'ch-1', title: '第一章', order: 1, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [], status: 'ready', blocks: [] },
    ],
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

describe('deriveTodayRecommendations', () => {
  it('空库：无可推荐', () => {
    expect(deriveTodayRecommendations([], NOW)).toEqual([])
  })

  it('到期复习优先，且同书多到期项聚合为一条', () => {
    const book = seedBook('book_a', {
      reviewSchedule: {
        b2: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
        b1: { kind: 'flash_cards', stage: 1, lapses: 0, dueAt: '2026-08-15T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
        b3: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
      },
    })
    const result = deriveTodayRecommendations([book], NOW)
    expect(result[0]).toMatchObject({
      action: 'review_due',
      bookId: 'book_a',
      rank: 'primary',
      evidenceRefs: ['b1', 'b2'], // 排序确定
    })
    expect(result[0].reason).toContain('2 个概念')
    expect(result[0].id).toMatch(/^rec_\d{8}_review_due_book_a$/)
  })

  it('确定性：同输入同输出', () => {
    const books = [
      seedBook('book_a', {
        reviewSchedule: { b1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' } },
      }),
      seedBook('book_b'),
    ]
    const first = deriveTodayRecommendations(books, NOW)
    const second = deriveTodayRecommendations(books, NOW)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('继续阅读兜底：有可读章节且无复习压力', () => {
    const book = seedBook('book_read')
    const result = deriveTodayRecommendations([book], NOW)
    expect(result[0]).toMatchObject({ action: 'continue_reading', bookId: 'book_read', rank: 'primary' })
    expect(result[0].reason).toContain('继续读')
  })

  it('最多 1 主 + 2 备选', () => {
    const books = ['book_a', 'book_b', 'book_c', 'book_d'].map((id) =>
      seedBook(id, {
        reviewSchedule: { b1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' } },
      }))
    const result = deriveTodayRecommendations(books, NOW)
    expect(result).toHaveLength(3)
    expect(result[0].rank).toBe('primary')
    expect(result[1].rank).toBe('alternative')
    expect(result[2].rank).toBe('alternative')
  })

  it('expiresAt 为次日 00:00', () => {
    const result = deriveTodayRecommendations([seedBook('book_a')], NOW)
    expect(result[0].expiresAt).toBe(new Date(2026, 7, 16).toISOString()) // 本地次日零点
    expect(Date.parse(result[0].expiresAt)).toBeGreaterThan(NOW.getTime())
  })
})
