import { describe, expect, it } from 'vitest'

import type { LearningEvidenceV1 } from '../books/bookTypes.js'
import { MasteryProjector } from './masteryProjector.js'

const quizEvidence = (
  id: string,
  isCorrect: boolean,
  createdAt: string,
): LearningEvidenceV1 => ({
  version: '1',
  id,
  kind: 'quiz',
  chapterId: 'ch-1',
  conceptId: 'concept-1',
  sourceBlockId: 'quiz-1',
  statement: isCorrect ? '答对' : '答错待复习',
  outcome: isCorrect ? 'mastered' : 'review',
  createdAt,
  payload: {
    attemptId: `attempt-${id}`,
    answerId: isCorrect ? 'a' : 'b',
    isCorrect,
  },
})

describe('MasteryProjector', () => {
  it('projects migrated quiz evidence with the unchanged recent-five weighting', () => {
    const evidence = [
      quizEvidence('1', true, '2026-08-14T01:00:00.000Z'),
      quizEvidence('2', true, '2026-08-14T02:00:00.000Z'),
      quizEvidence('3', true, '2026-08-14T03:00:00.000Z'),
      quizEvidence('4', true, '2026-08-14T04:00:00.000Z'),
      quizEvidence('5', false, '2026-08-14T05:00:00.000Z'),
      quizEvidence('old-ignored', false, '2026-08-14T00:00:00.000Z'),
    ]

    expect(new MasteryProjector().project(evidence, {
      chapterId: 'ch-1',
      conceptId: 'concept-1',
    })).toEqual({ chapter: 0.75, concept: 0.75 })
  })

  it('uses passed Feynman evidence only as a capped assist', () => {
    const feynman: LearningEvidenceV1 = {
      version: '1',
      id: 'feynman-1',
      kind: 'feynman',
      chapterId: 'ch-1',
      conceptId: 'concept-1',
      sourceBlockId: 'ch-1',
      statement: '费曼复述通过',
      outcome: 'mastered',
      createdAt: '2026-08-14T06:00:00.000Z',
      payload: {
        confirmedTextDigest: 'digest',
        confirmedTextLength: 14,
        passed: true,
        feedbackCategory: 'positive',
        gapCategory: 'none',
      },
    }

    const onlyFeynman = new MasteryProjector().project([feynman], {
      chapterId: 'ch-1', conceptId: 'concept-1',
    })
    expect(onlyFeynman).toEqual({ chapter: 0.15, concept: 0.15 })
    expect(onlyFeynman.chapter).toBeLessThan(1)

    const repeated = new MasteryProjector().project([feynman, { ...feynman, id: 'feynman-2' }], {
      chapterId: 'ch-1', conceptId: 'concept-1',
    })
    expect(repeated).toEqual({ chapter: 0.15, concept: 0.15 })
  })

  it('keeps an empty concept id scoped to the target quiz block', () => {
    const target = {
      ...quizEvidence('target', true, '2026-08-14T01:00:00.000Z'),
      conceptId: '',
      sourceBlockId: 'quiz-target',
    }
    const unrelated = {
      ...quizEvidence('other', true, '2026-08-14T02:00:00.000Z'),
      conceptId: '',
      sourceBlockId: 'quiz-other',
    }

    expect(new MasteryProjector().project([target, unrelated], {
      chapterId: 'ch-1', conceptId: '', sourceBlockId: 'quiz-target',
    }).concept).toBe(0.5)
  })
})
