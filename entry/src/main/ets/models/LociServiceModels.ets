import { LociLearningBlock, LociQuizOption } from './LociModels'

/** UI 可消费的服务结果；页面不应依赖 HTTP Wire DTO。 */
export interface LociQuizSubmissionResult {
  isCorrect: boolean
  advice: string
}

export interface LociFeynmanSubmissionResult {
  passed: boolean
  feedback: string
  gap: string
}

export interface LociProgressSnapshot {
  visitedChapterIds: string[]
  bookmarkedChapterIds: string[]
}

export interface LociReviewCard {
  front: string
  back: string
  hint?: string
}

export interface LociReviewQuiz {
  kindLabel: string
  question: string
  options: LociQuizOption[]
  correctOptionId: string
  explanation: string
}

export interface LociReviewQueueItem {
  key: string
  label: string
  reveal: string
  kind: string
  blockId: string
  quiz: LociReviewQuiz | null
  cards: LociReviewCard[]
  anchorId: string
}

export interface LociChapterGenerationCallbacks {
  onChapterStart: (chapterId: string) => void
  onBlock: (index: number, block: LociLearningBlock) => void
  onChapterDone: (blockCount: number, warnings: string[]) => void
  onError: (code: string, message: string) => void
}

export interface LociChapterGenerationSession {
  done: Promise<void>
  cancel: () => void
}
