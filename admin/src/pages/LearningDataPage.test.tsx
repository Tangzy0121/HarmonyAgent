import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ConceptMastery, LearnerProfile } from '../types/learnerProfile'
import { LearningDataPage } from './LearningDataPage'

function concept(overrides: Partial<ConceptMastery> & { label: string }): ConceptMastery {
  return {
    displayLabel: overrides.label,
    mastery: 0.2,
    attempts: 2,
    lastOutcome: 'review',
    lastAttemptAt: '2026-08-17T08:00:00.000Z',
    sources: [{ bookId: 'book_a', chapterId: 'ch-1', conceptId: `cpt-${overrides.label}` }],
    forgettingCliff: false,
    ...overrides,
  }
}

function profile(concepts: ConceptMastery[]): LearnerProfile {
  return {
    concepts,
    rhythm: {
      activeDays30: 1,
      streakDays: 1,
      periodDistribution: { morning: 1, afternoon: 0, evening: 0, night: 0 },
      dailyAverageEvents: 1,
      studiedToday: true,
      activeDayKeys: ['2026-08-17'],
    },
    derivedAt: '2026-08-17T10:00:00.000Z',
  }
}

describe('LearningDataPage 出题练习入口', () => {
  it('薄弱概念有来源时渲染「出题练习」按钮', () => {
    const html = renderToStaticMarkup(
      <LearningDataPage
        isActive
        learnerProfile={profile([concept({ label: '监督学习' })])}
        onOpenBook={() => undefined}
        onGenerateQuiz={vi.fn(async () => true)}
      />,
    )
    expect(html).toContain('出题练习')
    expect(html).toContain('learning-data-quiz-btn')
  })

  it('概念无来源（conceptId 为 null）时不渲染按钮', () => {
    const html = renderToStaticMarkup(
      <LearningDataPage
        isActive
        learnerProfile={profile([concept({ label: '孤儿概念', sources: [] })])}
        onOpenBook={() => undefined}
        onGenerateQuiz={vi.fn(async () => true)}
      />,
    )
    expect(html).toContain('孤儿概念')
    expect(html).not.toContain('learning-data-quiz-btn')
  })

  it('未提供 onGenerateQuiz 时不渲染按钮', () => {
    const html = renderToStaticMarkup(
      <LearningDataPage
        isActive
        learnerProfile={profile([concept({ label: '监督学习' })])}
        onOpenBook={() => undefined}
      />,
    )
    expect(html).not.toContain('learning-data-quiz-btn')
  })
})
