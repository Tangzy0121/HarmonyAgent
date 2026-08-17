import { describe, expect, it } from 'vitest'

import { deriveLearnerProfile, normalizeConceptLabel } from './learnerProfile.js'
import type { BookChapter, QuizAttempt, StoredBook } from '../books/bookTypes.js'

const NOW = new Date('2026-08-17T12:00:00')

// 本地时区构造时间戳：函数与断言同机同 TZ，round-trip 自洽，任何时区下结果一致
const localIso = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString()

interface BookSeed {
  id: string
  conceptId?: string
  conceptLabel?: string
  attempts?: Array<Pick<QuizAttempt, 'isCorrect' | 'submittedAt'>>
  scheduleStage?: number
}

function makeBook(seed: BookSeed): StoredBook {
  const conceptId = seed.conceptId ?? 'c-1'
  const conceptLabel = seed.conceptLabel ?? '监督学习'
  const chapter: BookChapter = {
    id: 'ch-1',
    title: '第一章',
    order: 0,
    objective: '',
    coreConceptId: conceptId,
    estimatedMinutes: 6,
    sourceAnchors: [],
    status: 'ready',
    blocks: [
      {
        id: 'blk-concept', type: 'concept', status: 'ready', title: '节点', revision: 1, sourceAnchors: [],
        concepts: [{ id: conceptId, label: conceptLabel, description: '', learningState: '暂无学习记录' }],
        relations: [],
      },
      {
        id: 'blk-quiz', type: 'quiz', status: 'ready', title: '小测', revision: 1, sourceAnchors: [],
        conceptId, question: '', options: [], correctAnswerId: 'o1', feedback: '',
      },
    ],
  } as unknown as BookChapter
  const attempts: QuizAttempt[] = (seed.attempts ?? []).map((attempt, index) => ({
    id: `att-${seed.id}-${index}`,
    chapterId: 'ch-1',
    blockId: 'blk-quiz',
    answerId: 'o1',
    isCorrect: attempt.isCorrect,
    submittedAt: attempt.submittedAt,
  }))
  const book: StoredBook = {
    id: seed.id,
    chapters: [chapter],
    quizAttempts: attempts,
    evidence: [],
    userNotes: [],
    reviewSchedule: seed.scheduleStage === undefined ? undefined : {
      'blk-quiz': { kind: 'quiz', stage: seed.scheduleStage, lapses: 0, dueAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
    },
  } as unknown as StoredBook
  return book
}

describe('normalizeConceptLabel', () => {
  it('trims, lowercases and folds fullwidth to halfwidth', () => {
    expect(normalizeConceptLabel('  Supervised Learning ')).toBe('supervised learning')
    expect(normalizeConceptLabel('Ｓｕｐｅｒｖｉｓｅｄ　Ｌｅａｒｎｉｎｇ')).toBe('supervised learning')
    expect(normalizeConceptLabel('监督学习')).toBe('监督学习')
  })
})

describe('deriveLearnerProfile · concepts', () => {
  it('returns an empty profile for no books', () => {
    const profile = deriveLearnerProfile([], NOW)
    expect(profile.concepts).toEqual([])
    expect(profile.rhythm.activeDays30).toBe(0)
    expect(profile.rhythm.streakDays).toBe(0)
    expect(profile.derivedAt).toBe(NOW.toISOString())
  })

  it('merges same-label concepts across books and computes mastery on merged attempts', () => {
    const books = [
      makeBook({ id: 'book-1', conceptLabel: ' 监督学习 ', attempts: [{ isCorrect: true, submittedAt: '2026-08-10T10:00:00.000Z' }] }),
      makeBook({ id: 'book-2', conceptLabel: '监督学习', attempts: [{ isCorrect: false, submittedAt: '2026-08-12T10:00:00.000Z' }] }),
    ]

    const profile = deriveLearnerProfile(books, NOW)

    expect(profile.concepts).toHaveLength(1)
    const concept = profile.concepts[0]
    expect(concept.label).toBe('监督学习')
    expect(concept.attempts).toBe(2)
    expect(concept.mastery).toBe(0.487179) // 两次作答、新错旧对 → 0.95/1.95，未触 0.8 封顶
    expect(concept.lastOutcome).toBe('review')
    expect(concept.lastAttemptAt).toBe('2026-08-12T10:00:00.000Z')
    expect(concept.sources).toHaveLength(2)
    expect(concept.displayLabel).toBe('监督学习') // 最近一次出现的原始写法
  })

  it('keeps single-attempt mastery capped at 0.5', () => {
    const books = [makeBook({ id: 'book-1', attempts: [{ isCorrect: true, submittedAt: '2026-08-10T10:00:00.000Z' }] })]
    expect(deriveLearnerProfile(books, NOW).concepts[0].mastery).toBe(0.5)
  })

  it('includes concepts without attempts (mastery 0, no outcome, no cliff)', () => {
    const profile = deriveLearnerProfile([makeBook({ id: 'book-1' })], NOW)
    const concept = profile.concepts[0]
    expect(concept.mastery).toBe(0)
    expect(concept.attempts).toBe(0)
    expect(concept.lastOutcome).toBeNull()
    expect(concept.forgettingCliff).toBe(false)
  })
})

describe('deriveLearnerProfile · forgetting cliff', () => {
  // quiz 档位间隔 [1,4,10]：stage 2 → 当前档位 4 天，悬崖线 = 1.5 × 4 = 6 天
  it('flags a cliff when a mastered concept is idle beyond 1.5× its stage interval', () => {
    const books = [makeBook({
      id: 'book-1',
      attempts: [{ isCorrect: true, submittedAt: '2026-08-10T12:00:00.000Z' }], // 7 天前 > 6 天
      scheduleStage: 2,
    })]
    expect(deriveLearnerProfile(books, NOW).concepts[0].forgettingCliff).toBe(true)
  })

  it('does not flag a cliff inside the threshold', () => {
    const books = [makeBook({
      id: 'book-1',
      attempts: [{ isCorrect: true, submittedAt: '2026-08-15T12:00:00.000Z' }], // 2 天前 < 6 天
      scheduleStage: 2,
    })]
    expect(deriveLearnerProfile(books, NOW).concepts[0].forgettingCliff).toBe(false)
  })

  it('does not flag a cliff when the latest attempt was wrong, or when there is no schedule', () => {
    const wrong = [makeBook({
      id: 'book-1',
      attempts: [{ isCorrect: false, submittedAt: '2026-08-01T12:00:00.000Z' }],
      scheduleStage: 2,
    })]
    expect(deriveLearnerProfile(wrong, NOW).concepts[0].forgettingCliff).toBe(false)

    const noSchedule = [makeBook({
      id: 'book-1',
      attempts: [{ isCorrect: true, submittedAt: '2026-08-01T12:00:00.000Z' }],
    })]
    expect(deriveLearnerProfile(noSchedule, NOW).concepts[0].forgettingCliff).toBe(false)
  })
})

describe('deriveLearnerProfile · rhythm', () => {
  it('counts active days in the last 30 days and the current streak', () => {
    const books = [makeBook({
      id: 'book-1',
      attempts: [
        { isCorrect: true, submittedAt: localIso(2026, 8, 17, 9) }, // 今天
        { isCorrect: true, submittedAt: localIso(2026, 8, 16, 9) }, // 昨天
        { isCorrect: true, submittedAt: localIso(2026, 8, 15, 9) }, // 前天
        { isCorrect: true, submittedAt: localIso(2026, 8, 10, 9) }, // 7 天前（streak 断）
        { isCorrect: true, submittedAt: localIso(2026, 7, 10, 9) }, // 38 天前（出窗）
      ],
    })]

    const rhythm = deriveLearnerProfile(books, NOW).rhythm

    expect(rhythm.activeDays30).toBe(4)
    expect(rhythm.streakDays).toBe(3)
    expect(rhythm.dailyAverageEvents).toBeCloseTo(5 / 30, 5) // 5 个事件（含出窗的 38 天前那次）/ 30 天
    expect(rhythm.studiedToday).toBe(true)
  })

  it('starts the streak from yesterday when today has no events yet', () => {
    const books = [makeBook({
      id: 'book-1',
      attempts: [
        { isCorrect: true, submittedAt: localIso(2026, 8, 16, 9) },
        { isCorrect: true, submittedAt: localIso(2026, 8, 15, 9) },
      ],
    })]
    expect(deriveLearnerProfile(books, NOW).rhythm.streakDays).toBe(2)
    expect(deriveLearnerProfile(books, NOW).rhythm.studiedToday).toBe(false)
  })

  it('distributes events into local period buckets', () => {
    const books = [makeBook({
      id: 'book-1',
      attempts: [
        { isCorrect: true, submittedAt: localIso(2026, 8, 17, 8) }, // 上午
        { isCorrect: true, submittedAt: localIso(2026, 8, 17, 14) }, // 下午
        { isCorrect: true, submittedAt: localIso(2026, 8, 17, 20) }, // 晚上
        { isCorrect: true, submittedAt: localIso(2026, 8, 17, 23) }, // 深夜
      ],
    })]

    const dist = deriveLearnerProfile(books, NOW).rhythm.periodDistribution

    expect(dist.morning).toBeCloseTo(0.25, 5)
    expect(dist.afternoon).toBeCloseTo(0.25, 5)
    expect(dist.evening).toBeCloseTo(0.25, 5)
    expect(dist.night).toBeCloseTo(0.25, 5)
  })
})
