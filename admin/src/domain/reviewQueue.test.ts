import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../data/learningBook'
import { buildReviewQueue } from './reviewQueue'
import type { QuizAttempt } from '../types/learningBook'

function attemptAt(overrides: Partial<QuizAttempt>): QuizAttempt {
  return {
    id: 'attempt_x',
    chapterId: 'ch-1',
    blockId: 'blk-quiz-1',
    answerId: 'answer-a',
    isCorrect: false,
    submittedAt: '2026-08-11T01:00:00.000Z',
    ...overrides,
  }
}

describe('buildReviewQueue', () => {
  it('returns an empty queue when nothing has been attempted', () => {
    expect(buildReviewQueue(learningBookFixture)).toEqual([])
  })

  it('enqueues a quiz block whose latest attempt is wrong, with its question', () => {
    const book = { ...learningBookFixture, quizAttempts: [attemptAt({})] }

    expect(buildReviewQueue(book)).toEqual([
      { chapterId: 'ch-1', blockId: 'blk-quiz-1', question: '没有标签的邮件被模型自动分组，这属于监督学习吗？' },
    ])
  })

  it('keeps correctly answered blocks out of the queue', () => {
    const book = {
      ...learningBookFixture,
      quizAttempts: [attemptAt({ isCorrect: true, answerId: 'answer-b' })],
    }

    expect(buildReviewQueue(book)).toEqual([])
  })

  it('dequeues a block once a later attempt is correct（先错后对出队）', () => {
    const book = {
      ...learningBookFixture,
      quizAttempts: [
        attemptAt({ id: 'attempt_1', submittedAt: '2026-08-11T01:00:00.000Z' }),
        attemptAt({ id: 'attempt_2', isCorrect: true, answerId: 'answer-b', submittedAt: '2026-08-11T02:00:00.000Z' }),
      ],
    }

    expect(buildReviewQueue(book)).toEqual([])
  })

  it('orders queued blocks by their latest wrong attempt time ascending', () => {
    const book = {
      ...learningBookFixture,
      quizAttempts: [
        attemptAt({ id: 'attempt_late', blockId: 'blk-quiz-1', chapterId: 'ch-1', submittedAt: '2026-08-11T03:00:00.000Z' }),
        attemptAt({ id: 'attempt_early', blockId: 'blk-quiz-ch-2', chapterId: 'ch-2', answerId: 'ch-2-answer-a', submittedAt: '2026-08-11T01:00:00.000Z' }),
      ],
    }

    expect(buildReviewQueue(book).map((item) => item.blockId)).toEqual(['blk-quiz-ch-2', 'blk-quiz-1'])
  })

  it('ignores attempts on blocks that no longer exist in the book', () => {
    const book = {
      ...learningBookFixture,
      quizAttempts: [attemptAt({ blockId: 'blk-quiz-gone' })],
    }

    expect(buildReviewQueue(book)).toEqual([])
  })
})
