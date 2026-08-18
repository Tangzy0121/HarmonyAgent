import { describe, expect, it } from 'vitest'
import { buildLearningDashboard } from './learningDashboard'
import type { ConceptMastery, LearnerProfile } from '../types/learnerProfile'

function concept(overrides: Partial<ConceptMastery> & { label: string }): ConceptMastery {
  return {
    displayLabel: overrides.label,
    mastery: 0,
    attempts: 1,
    lastOutcome: 'review',
    lastAttemptAt: '2026-08-17T08:00:00.000Z',
    sources: [{ bookId: 'book_a', chapterId: 'ch1', conceptId: overrides.label }],
    forgettingCliff: false,
    ...overrides,
  }
}

function profile(overrides: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    concepts: [],
    rhythm: {
      activeDays30: 0,
      streakDays: 0,
      periodDistribution: { morning: 0, afternoon: 0, evening: 0, night: 0 },
      dailyAverageEvents: 0,
      studiedToday: false,
      activeDayKeys: [],
    },
    derivedAt: '2026-08-17T10:00:00.000Z',
    ...overrides,
  }
}

// 本地时区构造（不能用 T..Z 的 UTC 串，避免时区陷阱）
const NOW = new Date(2026, 7, 17, 15, 30)

function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

describe('buildLearningDashboard 掌握度分桶', () => {
  it('按 mastery/attempts 分四桶', () => {
    const view = buildLearningDashboard(profile({
      concepts: [
        concept({ label: 'a', mastery: 0.9, attempts: 5 }),
        concept({ label: 'b', mastery: 0.5, attempts: 3 }),
        concept({ label: 'c', mastery: 0.1, attempts: 2 }),
        concept({ label: 'd', mastery: 0, attempts: 0 }),
      ],
    }), NOW)
    expect(view.buckets).toEqual({ mastered: 1, learning: 1, needsReview: 1, noRecord: 1 })
  })

  it('边界：0.8 归已掌握、0.3 归学习中', () => {
    const view = buildLearningDashboard(profile({
      concepts: [
        concept({ label: 'a', mastery: 0.8, attempts: 4 }),
        concept({ label: 'b', mastery: 0.3, attempts: 4 }),
      ],
    }), NOW)
    expect(view.buckets.mastered).toBe(1)
    expect(view.buckets.learning).toBe(1)
  })

  it('空概念列表分桶全零', () => {
    const view = buildLearningDashboard(profile(), NOW)
    expect(view.buckets).toEqual({ mastered: 0, learning: 0, needsReview: 0, noRecord: 0 })
  })
})

describe('buildLearningDashboard 薄弱与悬崖', () => {
  it('薄弱 Top5 按 mastery 升序、跳过无记录概念、带来源书', () => {
    const concepts = Array.from({ length: 7 }, (_, i) =>
      concept({ label: `c${i}`, mastery: (i + 1) * 0.1, attempts: 2, sources: [{ bookId: `book_${i}`, chapterId: 'ch', conceptId: `c${i}` }] }),
    )
    concepts.push(concept({ label: 'noRecord', mastery: 0, attempts: 0 }))
    const view = buildLearningDashboard(profile({ concepts }), NOW)
    expect(view.weakConcepts.map((c) => c.label)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
    expect(view.weakConcepts[0]).toMatchObject({ mastery: 0.1, bookId: 'book_0', chapterId: 'ch', conceptId: 'c0' })
  })

  it('悬崖列表只含 forgettingCliff=true，按 mastery 升序', () => {
    const view = buildLearningDashboard(profile({
      concepts: [
        concept({ label: 'safe', mastery: 0.9, forgettingCliff: false }),
        concept({ label: 'cliff2', mastery: 0.6, forgettingCliff: true }),
        concept({ label: 'cliff1', mastery: 0.2, forgettingCliff: true }),
      ],
    }), NOW)
    expect(view.cliffConcepts.map((c) => c.label)).toEqual(['cliff1', 'cliff2'])
  })

  it('无来源的概念 bookId/conceptId/chapterId 为 null', () => {
    const view = buildLearningDashboard(profile({
      concepts: [concept({ label: 'orphan', mastery: 0.4, sources: [] })],
    }), NOW)
    expect(view.weakConcepts[0].bookId).toBeNull()
    expect(view.weakConcepts[0].conceptId).toBeNull()
    expect(view.weakConcepts[0].chapterId).toBeNull()
  })
})

describe('buildLearningDashboard 30 天热力', () => {
  it('生成 30 格，末格为今日，活跃日与 activeDayKeys 对齐', () => {
    const today = localDayKey(NOW)
    const yesterday = localDayKey(new Date(2026, 7, 16, 12, 0))
    const view = buildLearningDashboard(profile({
      rhythm: {
        activeDays30: 2,
        streakDays: 2,
        periodDistribution: { morning: 1, afternoon: 0, evening: 0, night: 0 },
        dailyAverageEvents: 1,
        studiedToday: true,
        activeDayKeys: [yesterday, today],
      },
    }), NOW)
    expect(view.heatmap).toHaveLength(30)
    expect(view.heatmap[29]).toEqual({ dayKey: today, active: true, isToday: true })
    expect(view.heatmap[28]).toEqual({ dayKey: yesterday, active: true, isToday: false })
    expect(view.heatmap[27].active).toBe(false)
    expect(view.heatmap[0].isToday).toBe(false)
    expect(view.streakDays).toBe(2)
    expect(view.studiedToday).toBe(true)
  })

  it('activeDayKeys 为空时全不活跃', () => {
    const view = buildLearningDashboard(profile(), NOW)
    expect(view.heatmap.every((cell) => !cell.active)).toBe(true)
  })
})

describe('buildLearningDashboard 节律透传', () => {
  it('periodDistribution 与 dailyAverageEvents 原样透出', () => {
    const view = buildLearningDashboard(profile({
      rhythm: {
        activeDays30: 3,
        streakDays: 1,
        periodDistribution: { morning: 2, afternoon: 3, evening: 4, night: 1 },
        dailyAverageEvents: 3.3,
        studiedToday: true,
        activeDayKeys: [],
      },
    }), NOW)
    expect(view.periodDistribution).toEqual({ morning: 2, afternoon: 3, evening: 4, night: 1 })
    expect(view.dailyAverageEvents).toBe(3.3)
    expect(view.activeDays30).toBe(3)
  })
})
