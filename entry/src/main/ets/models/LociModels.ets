/**
 * loci 正式客户端领域投影。
 *
 * 本文件只定义 UI 可消费的稳定模型和展示文案，不包含 Fixture 容器、
 * 网络 Wire DTO 或传输逻辑。Fixture 与服务端映射都必须投影到这些类型。
 */

export type RecommendationKind = 'review' | 'continue' | 'plan' | 'create' | 'reflect'
export type RecommendationTone = 'blue' | 'mist' | 'stone'
export type NoticeTone = 'info' | 'warning' | 'danger'
export type LociProjectStatus =
  'draft' | 'preparing' | 'plan_ready' | 'active' | 'blocked' | 'completed' | 'archived'
export type LociProjectFilter = 'active' | 'completed' | 'archived'
export type LociChapterTaskState = 'pending' | 'running' | 'ready' | 'failed'
export type LociConceptState = 'unverified' | 'learning' | 'mastered' | 'review'
export type LociRelationType =
  'depends_on' | 'part_of' | 'causes' | 'contrasts_with' | 'applies_to' | 'extends'
export type LociChatScope =
  'learning_overview' | 'library' | 'project' | 'chapter' | 'concept' | 'selection'

export interface LociRecommendation {
  id: string
  projectId?: string
  kind: RecommendationKind
  tone: RecommendationTone
  eyebrow: string
  title: string
  reason: string
  projectLabel: string
  estimatedMinutes: number
  actionLabel: string
}

export interface LociProjectNotice {
  id: string
  tone: NoticeTone
  title: string
  detail: string
  actionLabel: string
}

export interface LociSource {
  id: string
  name: string
  format: string
  size: string
  units?: string
}

export interface LociQuizOption {
  id: string
  label: string
}

export interface LociLearningBlock {
  id: string
  type: string
  title: string
  body?: string
  keyPoint?: string
  scenario?: string
  takeaway?: string
  formula?: string
  excerpt?: string
  conceptId?: string
  question?: string
  options?: LociQuizOption[]
  correctOptionId?: string
  explanation?: string
  prompt?: string
  sourceIds: string[]
}

export interface LociChapter {
  id: string
  order: number
  title: string
  estimatedMinutes: number
  taskState: string
  read: boolean
  bookmarked?: boolean
  objective?: string
  sourceRange?: string
  verified?: boolean
  blocks?: LociLearningBlock[]
}

export interface LociSourceAnchor {
  id: string
  documentId: string
  location: string
  excerpt: string
  contextBefore?: string
  contextAfter?: string
  precision: string
}

export interface LociConcept {
  id: string
  label: string
  definition: string
  state: string
  chapterIds: string[]
  sourceIds: string[]
}

export interface LociConceptRelation {
  id: string
  from: string
  to: string
  type: string
  reason: string
  sourceIds: string[]
}

export interface LociEvidence {
  id: string
  conceptId: string
  chapterId: string
  kind: string
  result: string
  summary: string
  occurredAt: string
  sourceEventLabel: string
  sourceIds: string[]
}

export interface LociProjectSummary {
  id: string
  title: string
  shortTitle?: string
  goal: string
  level: string
  depth: string
  source: LociSource
  status: string
  lastStudiedLabel: string
  chapters: LociChapter[]
  notice?: LociProjectNotice
  lastChapterId?: string
  concepts?: LociConcept[]
  relations?: LociConceptRelation[]
  anchors?: LociSourceAnchor[]
  evidence?: LociEvidence[]
  reviewConceptIds?: string[]
}

export const LOCI_EMPTY_PROJECT: LociProjectSummary = {
  id: '',
  title: '',
  goal: '',
  level: '',
  depth: '',
  source: { id: '', name: '', format: '', size: '' },
  status: '',
  lastStudiedLabel: '',
  chapters: []
}

export function projectStatusLabel(status: string): string {
  switch (status) {
    case 'draft': return '继续创建'
    case 'preparing': return '准备中'
    case 'plan_ready': return '方案待确认'
    case 'active': return '进行中'
    case 'blocked': return '需要处理'
    case 'completed': return '已完成'
    case 'archived': return '已归档'
    default: return status
  }
}

export function projectPrimaryAction(status: string): string {
  switch (status) {
    case 'draft': return '继续创建'
    case 'preparing': return '查看进度'
    case 'plan_ready': return '确认方案'
    case 'active': return '继续学习'
    case 'blocked': return '恢复项目'
    case 'completed': return '查看总结'
    case 'archived': return '查看项目'
    default: return '查看项目'
  }
}

export function chapterTaskStateLabel(state: string): string {
  switch (state) {
    case 'pending': return '等待生成'
    case 'running': return '正在生成'
    case 'ready': return '可以阅读'
    case 'failed': return '生成失败'
    default: return state
  }
}

export function conceptStateLabel(state: string): string {
  switch (state) {
    case 'unverified': return '未验证'
    case 'learning': return '学习中'
    case 'mastered': return '已掌握'
    case 'review': return '待复习'
    default: return state
  }
}

export function relationTypeLabel(type: string): string {
  switch (type) {
    case 'depends_on': return '依赖'
    case 'part_of': return '组成'
    case 'causes': return '导致'
    case 'contrasts_with': return '对比'
    case 'applies_to': return '应用于'
    case 'extends': return '扩展'
    default: return type
  }
}

export function chatScopeLabel(scope: string): string {
  switch (scope) {
    case 'learning_overview': return '学习概况'
    case 'library': return '学习库'
    case 'project': return '当前项目'
    case 'chapter': return '当前章节'
    case 'concept': return '当前概念'
    case 'selection': return '选中文字'
    default: return scope
  }
}

export function anchorPrecisionLabel(precision: string): string {
  switch (precision) {
    case 'exact': return '精确文本'
    case 'unit': return '章节范围'
    case 'page': return '页级范围'
    default: return '无法精确定位'
  }
}
