export type LearningBookStatus = 'proposal' | 'generating' | 'partial' | 'ready' | 'error'
export type ChapterStatus = 'pending' | 'generating' | 'ready' | 'partial' | 'error'
export type LearningBlockType = 'explanation' | 'concept' | 'example' | 'quiz'

export class LearningBookSummary {
  id: string
  title: string
  status: LearningBookStatus
  updatedAt: string
  activeChapterId: string

  constructor(id: string, title: string, status: LearningBookStatus, updatedAt: string,
    activeChapterId: string) {
    this.id = id
    this.title = title
    this.status = status
    this.updatedAt = updatedAt
    this.activeChapterId = activeChapterId
  }
}

export class BookChapter {
  id: string
  title: string
  order: number
  status: ChapterStatus
  blocks: Array<LearningBlock>

  constructor(id: string, title: string, order: number, status: ChapterStatus,
    blocks: Array<LearningBlock> = []) {
    this.id = id
    this.title = title
    this.order = order
    this.status = status
    this.blocks = blocks
  }
}

export class QuizOption {
  id: string
  marker: string
  text: string

  constructor(id: string, marker: string, text: string) {
    this.id = id
    this.marker = marker
    this.text = text
  }
}

export class LearningBlock {
  id: string
  type: LearningBlockType
  title: string
  body: string = ''
  keyPoint: string = ''
  scenario: string = ''
  takeaway: string = ''
  conceptLabel: string = ''
  conceptDescription: string = ''
  question: string = ''
  options: Array<QuizOption> = []
  correctAnswerId: string = ''
  feedback: string = ''

  constructor(id: string, type: LearningBlockType, title: string) {
    this.id = id
    this.type = type
    this.title = title
  }
}

export class LearningBook {
  id: string
  title: string
  status: LearningBookStatus
  updatedAt: string
  activeChapterId: string
  chapters: Array<BookChapter>

  constructor(id: string, title: string, status: LearningBookStatus, updatedAt: string,
    activeChapterId: string, chapters: Array<BookChapter>) {
    this.id = id
    this.title = title
    this.status = status
    this.updatedAt = updatedAt
    this.activeChapterId = activeChapterId
    this.chapters = chapters
  }
}

export class QuizSubmission {
  isCorrect: boolean
  feedback: string
  chapterMastery: number
  conceptMastery: number
  diagnosis: string

  constructor(isCorrect: boolean, feedback: string, chapterMastery: number,
    conceptMastery: number, diagnosis: string = '') {
    this.isCorrect = isCorrect
    this.feedback = feedback
    this.chapterMastery = chapterMastery
    this.conceptMastery = conceptMastery
    this.diagnosis = diagnosis
  }
}

export class FeynmanSubmission {
  passed: boolean
  feedback: string
  gap: string
  evidenceId: string
  projectionStatus: string
  chapterMastery: number
  conceptMastery: number

  constructor(passed: boolean, feedback: string, gap: string, evidenceId: string,
    projectionStatus: string, chapterMastery: number, conceptMastery: number) {
    this.passed = passed
    this.feedback = feedback
    this.gap = gap
    this.evidenceId = evidenceId
    this.projectionStatus = projectionStatus
    this.chapterMastery = chapterMastery
    this.conceptMastery = conceptMastery
  }
}
