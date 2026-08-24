import type { LearningEvidenceV1, QuizLearningEvidenceV1 } from '../books/bookTypes.js'
import { computeMastery } from '../books/mastery.js'

export interface MasteryProjectionScope {
  chapterId: string
  conceptId: string
  sourceBlockId?: string
}

export interface MasteryProjection {
  chapter: number
  concept: number
}

const FEYNMAN_ASSIST_CAP = 0.15

function projectScope(
  evidence: readonly LearningEvidenceV1[],
  matches: (item: LearningEvidenceV1) => boolean,
): number {
  const quiz = evidence
    .filter((item): item is QuizLearningEvidenceV1 => item.kind === 'quiz' && matches(item))
    .map((item) => ({
      isCorrect: item.payload.isCorrect,
      submittedAt: item.createdAt,
    }))
  const quizMastery = computeMastery(quiz)
  const hasPassedFeynman = evidence.some((item) =>
    item.kind === 'feynman' && item.payload.passed && matches(item))
  return Math.min(1, quizMastery + (hasPassedFeynman ? FEYNMAN_ASSIST_CAP : 0))
}

/** 确定性投影器：只消费 append-only LearningEvidenceV1。 */
export class MasteryProjector {
  project(
    evidence: readonly LearningEvidenceV1[],
    scope: MasteryProjectionScope,
  ): MasteryProjection {
    return {
      chapter: projectScope(evidence, (item) => item.chapterId === scope.chapterId),
      concept: projectScope(evidence, (item) =>
        scope.conceptId === '' && scope.sourceBlockId !== undefined
          ? item.sourceBlockId === scope.sourceBlockId
          : item.conceptId === scope.conceptId),
    }
  }
}
