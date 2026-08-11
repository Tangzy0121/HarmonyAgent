// 服务端学习书记录类型：镜像 admin/src/types/learningBook.ts 的 LearningBook 全字段
//（两侧不做跨包 import，字段需逐一对应），另加持久化字段 createdAt/updatedAt/generationJobs。

export type LearningGoal = '理解概念' | '课程学习' | '考试复习'

export type LearnerLevel = '入门' | '了解' | '熟悉'

export type LearningBookStatus = 'proposal' | 'generating' | 'partial' | 'ready' | 'error'

export type ChapterStatus = 'pending' | 'generating' | 'ready' | 'partial' | 'error'

export type BlockStatus = 'pending' | 'generating' | 'ready' | 'error' | 'hidden'

export type BookBlockType =
  | 'explanation'
  | 'example'
  | 'formula'
  | 'citation'
  | 'concept'
  | 'quiz'
  | 'callout'
  | 'flash_cards'
  | 'figure'
  | 'user_note'

export interface SourceDocument {
  id: string
  fileName: string
  format: 'PDF'
  pageCount: number
  sizeLabel: string
  updatedLabel: string
}

export interface SourceAnchor {
  sourceId: string
  fileName: string
  pageRange: string
  excerpt: string
}

export interface BookProposal {
  title: string
  description: string
  rationale: string
  estimatedMinutes: number
}

interface BaseBookBlock {
  id: string
  type: BookBlockType
  status: BlockStatus
  title: string
  revision: number
  sourceAnchors: SourceAnchor[]
}

export interface ExplanationBlock extends BaseBookBlock {
  type: 'explanation'
  body: string
  keyPoint: string
}

export interface ExampleBlock extends BaseBookBlock {
  type: 'example'
  scenario: string
  takeaway: string
}

export interface FormulaBlock extends BaseBookBlock {
  type: 'formula'
  formula: string
  explanation: string
}

export interface CitationBlock extends BaseBookBlock {
  type: 'citation'
  excerpt: string
  location: string
}

export interface ConceptItem {
  id: string
  label: string
  description: string
  learningState: '暂无学习记录' | '已学习' | '待复习'
}

export interface ConceptRelation {
  id: string
  sourceId: string
  targetId: string
  type: '前置' | '包含' | '相似' | '对比' | '应用'
  confidence: number
  status: '候选' | '已确认' | '已拒绝'
  sourceAnchor: SourceAnchor
}

export interface ConceptBlock extends BaseBookBlock {
  type: 'concept'
  concepts: ConceptItem[]
  relations: ConceptRelation[]
}

export interface QuizOption {
  id: string
  marker: string
  text: string
}

export interface QuizBlock extends BaseBookBlock {
  type: 'quiz'
  conceptId: string
  question: string
  options: QuizOption[]
  correctAnswerId: string
  feedback: string
}

export interface UserNoteBlock extends BaseBookBlock {
  type: 'user_note'
  noteId: string
}

export interface CalloutBlock extends BaseBookBlock {
  type: 'callout'
  kind: 'key_idea' | 'pitfall' | 'tip' | 'insight'
  body: string
}

export interface FlashCard {
  front: string
  back: string
  hint?: string
}

export interface FlashCardsBlock extends BaseBookBlock {
  type: 'flash_cards'
  cards: FlashCard[]
}

export interface FigureBlock extends BaseBookBlock {
  type: 'figure'
  kind: 'flowchart' | 'mindmap' | 'timeline' | 'sequence'
  mermaid: string
  caption: string
}

export type BookBlock =
  | ExplanationBlock
  | ExampleBlock
  | FormulaBlock
  | CitationBlock
  | ConceptBlock
  | QuizBlock
  | CalloutBlock
  | FlashCardsBlock
  | FigureBlock
  | UserNoteBlock

export interface BookChapter {
  id: string
  title: string
  order: number
  objective: string
  coreConceptId: string
  estimatedMinutes: number
  sourceAnchors: SourceAnchor[]
  status: ChapterStatus
  blocks: BookBlock[]
}

export interface UserNote {
  id: string
  chapterId: string
  blockId: string
  body: string
  createdAt: string
}

export interface QuizAttempt {
  id: string
  chapterId: string
  blockId: string
  answerId: string
  isCorrect: boolean
  submittedAt: string
}

export interface LearningEvidence {
  id: string
  chapterId: string
  conceptId: string
  sourceBlockId: string
  statement: string
  outcome: 'mastered' | 'review'
  createdAt: string
}

export interface GenerationJob {
  chapterId: string
  status: 'pending' | 'generating' | 'ready' | 'error'
  attempts: number
  lastError: string | null
  updatedAt: string
}

export interface PretestQuestion {
  id: string
  chapterId: string
  question: string
  options: QuizOption[]
  correctAnswerId: string
  explanation: string
}

export interface PretestResult {
  answers: Record<string, string>
  suggestedStartChapterId: string
  skippableChapterIds: string[]
  submittedAt: string
}

export interface BookPretest {
  questions: PretestQuestion[]
  result: PretestResult | null
}

export type ReviewKind = 'quiz' | 'flash_cards'

export interface ReviewScheduleEntry {
  kind: ReviewKind
  stage: number
  lapses: number
  dueAt: string
  updatedAt: string
}

export interface StoredBook {
  id: string
  source: SourceDocument
  goal: LearningGoal
  learnerLevel: LearnerLevel
  proposal: BookProposal
  status: LearningBookStatus
  chapters: BookChapter[]
  activeChapterId: string
  userNotes: UserNote[]
  quizAttempts: QuizAttempt[]
  evidence: LearningEvidence[]
  pretest?: BookPretest
  reviewSchedule?: Record<string, ReviewScheduleEntry>
  createdAt: string
  updatedAt: string
  generationJobs: GenerationJob[]
}

export const LEARNING_GOALS: readonly LearningGoal[] = ['理解概念', '课程学习', '考试复习']

export const LEARNER_LEVELS: readonly LearnerLevel[] = ['入门', '了解', '熟悉']
