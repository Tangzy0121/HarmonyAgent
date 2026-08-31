import {
  LociConcept,
  LociLearningBlock,
  LociProjectSummary,
  LociQuizOption,
  LociSourceAnchor
} from '../models/LociModels'
import { LociReviewQueueItem, LociReviewQuiz } from '../models/LociServiceModels'

function conceptAnchorId(project: LociProjectSummary, concept: LociConcept): string {
  const first: string | undefined = concept.sourceIds[0]
  const found: LociSourceAnchor | undefined = (project.anchors ?? []).find(
    (anchor: LociSourceAnchor): boolean => anchor.id === first)
  return found?.id ?? ''
}

function conceptQuiz(project: LociProjectSummary, concept: LociConcept): LociReviewQuiz {
  let quiz: LociReviewQuiz | null = null
  for (const chapter of project.chapters) {
    for (const block of chapter.blocks ?? []) {
      const candidate: LociLearningBlock = block
      if (candidate.type === 'quiz' && candidate.conceptId === concept.id) {
        quiz = {
          kindLabel: '应用判断',
          question: candidate.question ?? '',
          options: candidate.options ?? [],
          correctOptionId: candidate.correctOptionId ?? '',
          explanation: candidate.explanation ?? concept.definition
        } as LociReviewQuiz
        break
      }
    }
    if (quiz !== null) {
      return quiz
    }
  }
  const options: LociQuizOption[] = [
    { id: 'a', label: '准确,与我的理解一致' } as LociQuizOption,
    { id: 'b', label: '不准确,与我的理解有出入' } as LociQuizOption
  ]
  return {
    kindLabel: '概念判断',
    question: `判断:「${concept.label}」——${concept.definition}`,
    options: options,
    correctOptionId: 'a',
    explanation: concept.definition
  } as LociReviewQuiz
}

export function createFixtureReviewItem(project: LociProjectSummary,
  concept: LociConcept): LociReviewQueueItem {
  return {
    key: concept.id,
    label: concept.label,
    reveal: concept.definition,
    kind: 'concept',
    blockId: '',
    quiz: conceptQuiz(project, concept),
    cards: [],
    anchorId: conceptAnchorId(project, concept)
  } as LociReviewQueueItem
}
