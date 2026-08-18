export type LearningGoal = '理解概念' | '课程学习' | '考试复习'

export type LearnerLevel = '入门' | '了解' | '熟悉'

export type LearningBookStatus = 'proposal' | 'generating' | 'partial' | 'ready' | 'error'

export type ChapterStatus = 'pending' | 'generating' | 'ready' | 'partial' | 'error'

export type BlockStatus = 'pending' | 'generating' | 'ready' | 'error' | 'hidden'

export type AgentContextScope = 'chapter' | 'book'

export type BookBlockType = 'explanation' | 'example' | 'formula' | 'citation' | 'concept' | 'quiz' | 'callout' | 'flash_cards' | 'figure' | 'user_note'

export interface SourceDocument {
  id: string
  fileName: string
  format: 'PDF' | 'Markdown' | 'DOCX' | 'EPUB'
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

export const DIAGNOSIS_TYPES = ['concept', 'application', 'misread', 'overconfident'] as const
export type DiagnosisType = (typeof DIAGNOSIS_TYPES)[number]

export interface AttemptDiagnosis {
  type: DiagnosisType
  advice: string
}

export interface QuizBlock extends BaseBookBlock {
  type: 'quiz'
  conceptId: string
  question: string
  options: QuizOption[]
  correctAnswerId: string
  feedback: string
  /** 缺省 = 成书生成；'adaptive' = 薄弱概念智能出题现场生成 */
  origin?: 'adaptive'
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

export type BookBlock = ExplanationBlock | ExampleBlock | FormulaBlock | CitationBlock | ConceptBlock | QuizBlock | CalloutBlock | FlashCardsBlock | FigureBlock | UserNoteBlock

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

/** 用户问答卡（对话沉淀「存入题库」产物，与 server bookTypes.UserCard 镜像） */
export interface UserCard {
  id: string
  chapterId: string
  front: string
  back: string
  hint?: string
  createdAt: string
}

/** 题库条目（与 server books/bank.ts 镜像，派生读模型） */
export interface BankItem {
  blockId: string
  chapterId: string
  kind: 'quiz' | 'flash_cards'
  title: string
  conceptId: string | null
  conceptLabel: string | null
  attempts: number
  lastCorrect: boolean | null
  mastery: number
  schedule: { stage: number; dueAt: string } | null
  wrong: boolean
}

export interface QuizAttempt {
  id: string
  chapterId: string
  blockId: string
  answerId: string
  isCorrect: boolean
  submittedAt: string
  /** 答错时的四类诊断；答对/未配置/诊断失败为 null */
  diagnosis?: AttemptDiagnosis | null
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

/** 章节阅读进度：已读（首读顺序）、书签、逐章最近阅读时间（ISO），镜像 server bookTypes */
export interface ReadingProgress {
  visitedChapterIds: string[]
  bookmarkedChapterIds: string[]
  lastReadAt: Record<string, string>
}

export interface WeakChapter {
  chapterId: string
  title: string
  mastery: number
}

export interface BookCompletion {
  completionScore: number
  visitedCount: number
  totalChapters: number
  weakChapters: WeakChapter[]
}

export interface ReviewScheduleEntry {
  kind: ReviewKind
  stage: number
  lapses: number
  dueAt: string
  updatedAt: string
}

export interface LearningBook {
  id: string
  source: SourceDocument
  /** 多文件合书的全部来源（= sources[0] 恒等于 source）；单源书缺省，读取回退 [source] */
  sources?: SourceDocument[]
  /** 多源书落盘的 docId → 全文 sha256；单源书缺省 */
  sourceFingerprints?: Record<string, string>
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
  readingProgress?: ReadingProgress
  reviewSchedule?: Record<string, ReviewScheduleEntry>
}

export interface AgentContext {
  scope: AgentContextScope
  label: string
  chapterIds: string[]
  sourceAnchors: SourceAnchor[]
}
