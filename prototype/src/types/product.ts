export type PrimaryDestination = 'today' | 'library'

export type Screen =
  | 'today'
  | 'library'
  | 'settings'
  | 'account'
  | 'create'
  | 'plan'
  | 'overview'
  | 'workspace'
  | 'review'
  | 'summary'

export type ProjectStatus = 'draft' | 'preparing' | 'plan_ready' | 'active' | 'blocked' | 'completed' | 'archived'
export type ProjectFilter = 'active' | 'completed' | 'archived'
export type ChapterTaskState = 'pending' | 'running' | 'ready' | 'failed'
export type ConceptState = 'unverified' | 'learning' | 'mastered' | 'review'
export type WorkspaceMode = 'content' | 'graph'
export type ChatScope = 'learning_overview' | 'library' | 'project' | 'chapter' | 'concept' | 'selection'

export interface SourceAnchor {
  id: string
  documentId: string
  location: string
  excerpt: string
  contextBefore?: string
  contextAfter?: string
  precision: 'exact' | 'unit' | 'page' | 'unavailable'
}

export interface ExplanationBlock {
  id: string
  type: 'explanation'
  title: string
  body: string
  keyPoint: string
  sourceIds: string[]
}

export interface ExampleBlock {
  id: string
  type: 'example'
  title: string
  scenario: string
  takeaway: string
  sourceIds: string[]
}

export interface ConclusionBlock {
  id: string
  type: 'formula_or_conclusion'
  title: string
  formula?: string
  body: string
  sourceIds: string[]
}

export interface CitationBlock {
  id: string
  type: 'citation'
  title: string
  excerpt: string
  sourceIds: string[]
}

export interface QuizBlock {
  id: string
  type: 'quiz'
  title: string
  conceptId: string
  question: string
  options: Array<{ id: string; label: string }>
  correctOptionId: string
  explanation: string
  sourceIds: string[]
}

export interface FeynmanBlock {
  id: string
  type: 'feynman'
  title: string
  prompt: string
  sourceIds: string[]
}

export type LearningBlock = ExplanationBlock | ExampleBlock | ConclusionBlock | CitationBlock | QuizBlock | FeynmanBlock

export interface Chapter {
  id: string
  order: number
  title: string
  objective: string
  estimatedMinutes: number
  sourceRange: string
  taskState: ChapterTaskState
  read: boolean
  verified: boolean
  blocks: LearningBlock[]
}

export interface Evidence {
  id: string
  conceptId: string
  chapterId: string
  kind: 'quiz' | 'feynman' | 'review'
  result: 'supports' | 'weakness' | 'contradiction' | 'uncertain'
  summary: string
  occurredAt: string
  sourceEventLabel: string
  sourceIds: string[]
}

export interface ConceptRelation {
  id: string
  from: string
  to: string
  type: 'depends_on' | 'part_of' | 'causes' | 'contrasts_with' | 'applies_to' | 'extends'
  reason: string
  sourceIds: string[]
}

export interface Concept {
  id: string
  label: string
  definition: string
  state: ConceptState
  chapterIds: string[]
  sourceIds: string[]
}

export interface ProjectNotice {
  id: string
  tone: 'info' | 'warning' | 'danger'
  title: string
  detail: string
  actionLabel: string
}

export interface LearningProject {
  id: string
  title: string
  shortTitle?: string
  goal: string
  level: '入门' | '了解' | '熟悉'
  depth: '快速理解' | '系统学习' | '深入掌握'
  source: { id: string; name: string; format: 'PDF' | 'Markdown' | 'DOCX'; size: string; units: string }
  status: ProjectStatus
  lastStudiedLabel: string
  lastChapterId: string
  chapters: Chapter[]
  concepts: Concept[]
  relations: ConceptRelation[]
  anchors: SourceAnchor[]
  evidence: Evidence[]
  notice?: ProjectNotice
  reviewConceptIds: string[]
}

export interface Recommendation {
  id: string
  projectId?: string
  kind: 'review' | 'continue' | 'plan' | 'create' | 'reflect'
  tone: 'blue' | 'mist' | 'stone'
  eyebrow: string
  title: string
  reason: string
  projectLabel: string
  estimatedMinutes: number
  actionLabel: string
}

export interface CreateDraft {
  file: { name: string; format: 'PDF' | 'Markdown' | 'DOCX'; size: string } | null
  goal: string
  level: LearningProject['level']
  depth: LearningProject['depth']
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  body: string
  sourceIds?: string[]
  supplement?: boolean
}
