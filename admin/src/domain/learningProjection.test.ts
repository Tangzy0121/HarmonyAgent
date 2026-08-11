import { describe, expect, it } from 'vitest'
import { knowledgeNodes } from '../data/learningMap'
import { learningBookFixture } from '../data/learningBook'
import { submitQuizAttempt } from './learningBook'
import {
  chapterMastery,
  computeMastery,
  deriveConceptLearningState,
  latestAttemptForBlock,
  projectLearningEvidence,
} from './learningProjection'
import type { QuizAttempt } from '../types/learningBook'

describe('projectLearningEvidence', () => {
  it('projects correct quiz evidence onto the knowledge map without an Agent decision', () => {
    const book = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-b')
    const nodes = projectLearningEvidence(knowledgeNodes, book.evidence)

    expect(nodes.find((node) => node.id === 'supervised-learning')?.learningState).toBe('已掌握')
  })

  it('projects an incorrect quiz attempt as review work', () => {
    const book = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-a')
    const nodes = projectLearningEvidence(knowledgeNodes, book.evidence)

    expect(nodes.find((node) => node.id === 'supervised-learning')?.learningState).toBe('待复习')
  })
})

describe('computeMastery（与 server/src/books/mastery.ts 同公式）', () => {
  const at = (isCorrect: boolean, submittedAt: string) => ({ isCorrect, submittedAt })

  it('returns 0 for no attempts', () => {
    expect(computeMastery([])).toBe(0)
  })

  it('caps a single correct attempt at 0.5', () => {
    expect(computeMastery([at(true, '2026-08-11T01:00:00Z')])).toBe(0.5)
  })

  it('caps two correct attempts at 0.8', () => {
    expect(computeMastery([
      at(true, '2026-08-11T01:00:00Z'),
      at(true, '2026-08-11T02:00:00Z'),
    ])).toBe(0.8)
  })

  it('lifts the cap at three attempts', () => {
    expect(computeMastery([
      at(true, '2026-08-11T01:00:00Z'),
      at(true, '2026-08-11T02:00:00Z'),
      at(true, '2026-08-11T03:00:00Z'),
    ])).toBe(1)
  })

  it('weights the most recent attempt heaviest: latest wrong + four prior correct = 0.75', () => {
    expect(computeMastery([
      at(true, '2026-08-11T01:00:00Z'),
      at(true, '2026-08-11T02:00:00Z'),
      at(true, '2026-08-11T03:00:00Z'),
      at(true, '2026-08-11T04:00:00Z'),
      at(false, '2026-08-11T05:00:00Z'),
    ])).toBe(0.75)
  })

  it('uses only the five most recent attempts and sorts unordered input by submittedAt', () => {
    expect(computeMastery([
      at(true, '2026-08-11T06:00:00Z'),
      at(false, '2026-08-11T01:00:00Z'),
      at(true, '2026-08-11T05:00:00Z'),
      at(true, '2026-08-11T02:00:00Z'),
      at(true, '2026-08-11T04:00:00Z'),
      at(true, '2026-08-11T03:00:00Z'),
    ])).toBe(1)
  })
})

function attemptAt(overrides: Partial<QuizAttempt>): QuizAttempt {
  return {
    id: 'attempt_x',
    chapterId: 'ch-1',
    blockId: 'blk-quiz-1',
    answerId: 'answer-b',
    isCorrect: true,
    submittedAt: '2026-08-11T01:00:00.000Z',
    ...overrides,
  }
}

describe('latestAttemptForBlock', () => {
  it('returns undefined when the block has no attempts', () => {
    expect(latestAttemptForBlock([attemptAt({})], 'blk-quiz-9')).toBeUndefined()
  })

  it('picks the most recent attempt by submittedAt regardless of array order', () => {
    const older = attemptAt({ id: 'attempt_old', isCorrect: false, submittedAt: '2026-08-11T01:00:00.000Z' })
    const newer = attemptAt({ id: 'attempt_new', isCorrect: true, submittedAt: '2026-08-11T02:00:00.000Z' })

    expect(latestAttemptForBlock([newer, older], 'blk-quiz-1')?.id).toBe('attempt_new')
    expect(latestAttemptForBlock([older, newer], 'blk-quiz-1')?.id).toBe('attempt_new')
  })
})

describe('chapterMastery', () => {
  it('returns null when the chapter has no attempts', () => {
    expect(chapterMastery(learningBookFixture, 'ch-1')).toBeNull()
  })

  it('computes mastery from the chapter attempts only', () => {
    const book = {
      ...learningBookFixture,
      quizAttempts: [
        attemptAt({ chapterId: 'ch-1' }),
        attemptAt({ id: 'attempt_other', chapterId: 'ch-2', blockId: 'blk-quiz-ch-2', isCorrect: false }),
      ],
    }

    expect(chapterMastery(book, 'ch-1')).toBe(0.5)
    expect(chapterMastery(book, 'ch-2')).toBe(0)
  })
})

describe('deriveConceptLearningState', () => {
  it('returns 暂无学习记录 when the concept has no attempts', () => {
    expect(deriveConceptLearningState(learningBookFixture, 'supervised-learning')).toBe('暂无学习记录')
  })

  it('ignores attempts on quiz blocks of other concepts', () => {
    const book = { ...learningBookFixture, quizAttempts: [attemptAt({})] }

    expect(deriveConceptLearningState(book, 'nonexistent-concept')).toBe('暂无学习记录')
    expect(deriveConceptLearningState(book, 'training-signal')).toBe('暂无学习记录')
  })

  it('returns 待复习 when the latest attempt is wrong and 已学习 when it is correct', () => {
    const wrong = { ...learningBookFixture, quizAttempts: [attemptAt({ isCorrect: false, answerId: 'answer-a' })] }
    expect(deriveConceptLearningState(wrong, 'supervised-learning')).toBe('待复习')

    const wrongThenCorrect = {
      ...learningBookFixture,
      quizAttempts: [
        attemptAt({ id: 'attempt_1', isCorrect: false, answerId: 'answer-a', submittedAt: '2026-08-11T01:00:00.000Z' }),
        attemptAt({ id: 'attempt_2', isCorrect: true, submittedAt: '2026-08-11T02:00:00.000Z' }),
      ],
    }
    expect(deriveConceptLearningState(wrongThenCorrect, 'supervised-learning')).toBe('已学习')
  })
})
