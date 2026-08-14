import {
  BookChapter,
  ChapterStatus,
  LearningBlock,
  LearningBook,
  LearningBookStatus,
  LearningBookSummary,
  QuizOption,
  QuizSubmission,
  FeynmanSubmission
} from '../learning/LearningModels'

interface WireProposal {
  title: string
}

interface WireConcept {
  id: string
  label: string
  description: string
}

interface WireOption {
  id: string
  marker: string
  text: string
}

interface WireBlock {
  id: string
  type: string
  title: string
  body: string
  keyPoint: string
  concepts: Array<WireConcept>
  scenario: string
  takeaway: string
  question: string
  options: Array<WireOption>
  correctAnswerId: string
  feedback: string
}

interface WireChapter {
  id: string
  title: string
  order: number
  status: string
  blocks: Array<WireBlock>
}

interface WireBook {
  id: string
  status: string
  updatedAt: string
  activeChapterId: string
  proposal: WireProposal
  chapters: Array<WireChapter>
}

interface WireAttempt {
  isCorrect: boolean
}

interface WireMastery {
  chapter: number
  concept: number
}

interface WireDiagnosis {
  type: string
  advice: string
}

interface WireQuizSubmission {
  attempt: WireAttempt
  mastery: WireMastery
  diagnosis: WireDiagnosis | null
}

interface WireFeynmanEvidence {
  id: string
}

interface WireFeynmanSubmission {
  passed: boolean
  feedback: string
  gap: string
  evidenceId?: string
  evidence?: WireFeynmanEvidence
  projectionStatus: string
  mastery?: WireMastery
}

function bookStatus(value: string): LearningBookStatus {
  if (value === 'proposal' || value === 'generating' || value === 'partial' ||
    value === 'ready' || value === 'error') {
    return value
  }
  throw new Error('invalid_book_payload')
}

function chapterStatus(value: string): ChapterStatus {
  if (value === 'pending' || value === 'generating' || value === 'ready' ||
    value === 'partial' || value === 'error') {
    return value
  }
  throw new Error('invalid_book_payload')
}

function requiredString(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('invalid_book_payload')
  }
  return value
}

function parseBlock(wire: WireBlock): LearningBlock | null {
  const id: string = requiredString(wire.id)
  const title: string = requiredString(wire.title)
  if (wire.type === 'explanation') {
    const block = new LearningBlock(id, 'explanation', title)
    block.body = requiredString(wire.body)
    block.keyPoint = requiredString(wire.keyPoint)
    return block
  }
  if (wire.type === 'concept') {
    if (!Array.isArray(wire.concepts) || wire.concepts.length === 0) {
      throw new Error('invalid_book_payload')
    }
    const block = new LearningBlock(id, 'concept', title)
    block.conceptLabel = requiredString(wire.concepts[0].label)
    block.conceptDescription = requiredString(wire.concepts[0].description)
    return block
  }
  if (wire.type === 'example') {
    const block = new LearningBlock(id, 'example', title)
    block.scenario = requiredString(wire.scenario)
    block.takeaway = requiredString(wire.takeaway)
    return block
  }
  if (wire.type === 'quiz') {
    if (!Array.isArray(wire.options) || wire.options.length < 2) {
      throw new Error('invalid_book_payload')
    }
    const block = new LearningBlock(id, 'quiz', title)
    block.question = requiredString(wire.question)
    block.correctAnswerId = requiredString(wire.correctAnswerId)
    block.feedback = requiredString(wire.feedback)
    const options: Array<QuizOption> = []
    for (let index: number = 0; index < wire.options.length; index++) {
      const option: WireOption = wire.options[index]
      options.push(new QuizOption(requiredString(option.id), requiredString(option.marker),
        requiredString(option.text)))
    }
    block.options = options
    return block
  }
  return null
}

function parseWireBook(wire: WireBook): LearningBook {
  const id: string = requiredString(wire.id)
  const title: string = requiredString(wire.proposal.title)
  if (!Array.isArray(wire.chapters)) {
    throw new Error('invalid_book_payload')
  }
  const chapters: Array<BookChapter> = []
  for (let index: number = 0; index < wire.chapters.length; index++) {
    const source: WireChapter = wire.chapters[index]
    if (!Array.isArray(source.blocks)) {
      throw new Error('invalid_book_payload')
    }
    const blocks: Array<LearningBlock> = []
    for (let blockIndex: number = 0; blockIndex < source.blocks.length; blockIndex++) {
      const block: LearningBlock | null = parseBlock(source.blocks[blockIndex])
      if (block !== null) {
        blocks.push(block)
      }
    }
    chapters.push(new BookChapter(requiredString(source.id), requiredString(source.title),
      source.order, chapterStatus(source.status), blocks))
  }
  return new LearningBook(id, title, bookStatus(wire.status), requiredString(wire.updatedAt),
    requiredString(wire.activeChapterId), chapters)
}

export function parseBook(payload: string): LearningBook {
  try {
    return parseWireBook(JSON.parse(payload) as WireBook)
  } catch (error) {
    throw new Error('invalid_book_payload')
  }
}

export function parseBookSummaries(payload: string): Array<LearningBookSummary> {
  try {
    const wires: Array<WireBook> = JSON.parse(payload) as Array<WireBook>
    if (!Array.isArray(wires)) {
      throw new Error('invalid_book_payload')
    }
    const summaries: Array<LearningBookSummary> = []
    for (let index: number = 0; index < wires.length; index++) {
      const book: LearningBook = parseWireBook(wires[index])
      summaries.push(new LearningBookSummary(book.id, book.title, book.status,
        book.updatedAt, book.activeChapterId))
    }
    return summaries
  } catch (error) {
    throw new Error('invalid_book_payload')
  }
}

export function parseQuizSubmission(payload: string): QuizSubmission {
  try {
    const wire: WireQuizSubmission = JSON.parse(payload) as WireQuizSubmission
    if (typeof wire.attempt.isCorrect !== 'boolean' ||
      typeof wire.mastery.chapter !== 'number' || typeof wire.mastery.concept !== 'number') {
      throw new Error('invalid_attempt_payload')
    }
    const diagnosis: string = wire.diagnosis === null ? '' : requiredString(wire.diagnosis.advice)
    const feedback: string = wire.attempt.isCorrect ? '回答正确。' :
      (diagnosis.length > 0 ? diagnosis : '这次还没有答对，请回看关键概念。')
    return new QuizSubmission(wire.attempt.isCorrect, feedback,
      wire.mastery.chapter, wire.mastery.concept, diagnosis)
  } catch (error) {
    throw new Error('invalid_attempt_payload')
  }
}

export function parseFeynmanSubmission(payload: string): FeynmanSubmission {
  try {
    const wire: WireFeynmanSubmission = JSON.parse(payload) as WireFeynmanSubmission
    if (typeof wire.passed !== 'boolean') throw new Error('invalid_feynman_payload')
    const feedback: string = requiredString(wire.feedback)
    const gap: string = typeof wire.gap === 'string' ? wire.gap.trim() : ''
    if (!wire.passed && gap.length === 0) throw new Error('invalid_feynman_payload')
    const evidenceId: string = typeof wire.evidenceId === 'string' ? wire.evidenceId :
      (wire.evidence !== undefined && typeof wire.evidence.id === 'string' ? wire.evidence.id : '')
    if (wire.projectionStatus !== 'projected' && wire.projectionStatus !== 'pending') {
      throw new Error('invalid_feynman_payload')
    }
    const projectionStatus: string = wire.projectionStatus
    const chapter: number = wire.mastery !== undefined && typeof wire.mastery.chapter === 'number' ?
      wire.mastery.chapter : -1
    const concept: number = wire.mastery !== undefined && typeof wire.mastery.concept === 'number' ?
      wire.mastery.concept : chapter
    return new FeynmanSubmission(wire.passed, feedback, gap, evidenceId,
      projectionStatus, chapter, concept)
  } catch (error) {
    throw new Error('invalid_feynman_payload')
  }
}
