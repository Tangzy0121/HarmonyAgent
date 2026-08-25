/**
 * loci fixture 数据形状(ArkTS)
 * 真源:prototype/src/types/product.ts 的 Recommendation / LearningProject / ProjectNotice;
 * 数据文件:entry/src/main/resources/rawfile/lociFixtures.json(由 prototype/src/data/mockData.ts 导出)。
 * M2 起 LociProjectSummary 补齐学习库/创建流所需字段(goal/level/depth/source/chapters)。
 * M3 起补齐工作区字段:章节 blocks 六类学习块、concepts/relations/evidence/anchors、
 * reviewConceptIds/lastChapterId,以及章节任务态/概念状态/关系类型/Chat 作用域文案映射。
 */

export type RecommendationKind = 'review' | 'continue' | 'plan' | 'create' | 'reflect'

export type RecommendationTone = 'blue' | 'mist' | 'stone'

export type NoticeTone = 'info' | 'warning' | 'danger'

/** ProjectStatus 7 态,真源:prototype/src/types/product.ts */
export type LociProjectStatus = 'draft' | 'preparing' | 'plan_ready' | 'active' | 'blocked' | 'completed' | 'archived'

/** ProjectFilter,真源:prototype/src/types/product.ts */
export type LociProjectFilter = 'active' | 'completed' | 'archived'

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

/** 来源信息,真源:LearningProject.source(units 仅原型占位,保留可选)。 */
export interface LociSource {
  id: string
  name: string
  format: string
  size: string
  units?: string
}

/** ChapterTaskState,真源:product.ts */
export type LociChapterTaskState = 'pending' | 'running' | 'ready' | 'failed'

/** ConceptState,真源:product.ts */
export type LociConceptState = 'unverified' | 'learning' | 'mastered' | 'review'

/** ConceptRelation.type,真源:product.ts */
export type LociRelationType =
  'depends_on' | 'part_of' | 'causes' | 'contrasts_with' | 'applies_to' | 'extends'

/** ChatScope,真源:product.ts */
export type LociChatScope =
  'learning_overview' | 'library' | 'project' | 'chapter' | 'concept' | 'selection'

/** QuizBlock.options 元素,真源:product.ts */
export interface LociQuizOption {
  id: string
  label: string
}

/**
 * LearningBlock 六类判别联合的 ArkTS 投影(M3):type 判别,各类型字段全部可选。
 * 真源:product.ts ExplanationBlock / ExampleBlock / ConclusionBlock /
 * CitationBlock / QuizBlock / FeynmanBlock;fixture 直接 JSON.parse,按 type 消费。
 */
export interface LociLearningBlock {
  id: string
  type: string
  title: string
  body?: string                // explanation / formula_or_conclusion
  keyPoint?: string            // explanation(关键判断)
  scenario?: string            // example
  takeaway?: string            // example(从例子带走)
  formula?: string             // formula_or_conclusion(可空,空则为纯结论)
  excerpt?: string             // citation
  conceptId?: string           // quiz
  question?: string            // quiz
  options?: LociQuizOption[]   // quiz
  correctOptionId?: string     // quiz
  explanation?: string         // quiz 提交后的关键解释
  prompt?: string              // feynman
  sourceIds: string[]
}

/**
 * 章节,真源:Chapter。
 * M3 扩展:objective / sourceRange / verified / blocks 只在 fixture 完整章节上存在;
 * 创建流 confirm_plan 合成的章节没有这些字段,故全部可选,消费侧必须兜底。
 */
export interface LociChapter {
  id: string
  order: number
  title: string
  estimatedMinutes: number
  taskState: string
  read: boolean
  objective?: string
  sourceRange?: string
  verified?: boolean
  blocks?: LociLearningBlock[]
}

/** SourceAnchor,真源:product.ts;precision 以 string 承载('exact'|'unit'|'page'|'unavailable')。 */
export interface LociSourceAnchor {
  id: string
  documentId: string
  location: string
  excerpt: string
  contextBefore?: string
  contextAfter?: string
  precision: string
}

/** Concept,真源:product.ts;state 取值见 LociConceptState。 */
export interface LociConcept {
  id: string
  label: string
  definition: string
  state: string
  chapterIds: string[]
  sourceIds: string[]
}

/** ConceptRelation,真源:product.ts;type 取值见 LociRelationType。 */
export interface LociConceptRelation {
  id: string
  from: string
  to: string
  type: string
  reason: string
  sourceIds: string[]
}

/** Evidence,真源:product.ts;kind='quiz'|'feynman'|'review',result='supports'|'weakness'|'contradiction'|'uncertain'。 */
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

/**
 * LearningProject 的 ArkTS 投影。
 * status/level/depth/source.format 以 string 承载(fixture 直接 JSON.parse),
 * 语义取值以 LociProjectStatus / product.ts 为准。
 */
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
  // ---- M3 工作区字段(fixture 完整项目才有,创建流合成项目没有,全部可选)----
  lastChapterId?: string
  concepts?: LociConcept[]
  relations?: LociConceptRelation[]
  anchors?: LociSourceAnchor[]
  evidence?: LociEvidence[]
  reviewConceptIds?: string[]
}

export interface LociFixtureData {
  projects: LociProjectSummary[]
  recommendations: LociRecommendation[]
}

/** @ComponentV2 @Param 默认值用的空项目(ArkTS 要求 @Param 必须就地初始化)。 */
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

/** 文案映射,真源:prototype/src/data/mockData.ts projectStatusLabel(逐字一致)。 */
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

/** 主动作文案,真源:prototype/src/data/mockData.ts projectPrimaryAction(逐字一致)。 */
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

/** 章节任务态文案,真源:prototype StatusBadge labels(逐字一致)。 */
export function chapterTaskStateLabel(state: string): string {
  switch (state) {
    case 'pending': return '等待生成'
    case 'running': return '正在生成'
    case 'ready': return '可以阅读'
    case 'failed': return '生成失败'
    default: return state
  }
}

/** 概念学习状态文案,真源:prototype StatusBadge labels(逐字一致)。 */
export function conceptStateLabel(state: string): string {
  switch (state) {
    case 'unverified': return '未验证'
    case 'learning': return '学习中'
    case 'mastered': return '已掌握'
    case 'review': return '待复习'
    default: return state
  }
}

/** 概念关系类型文案,真源:prototype ConceptGraph relationLabels(逐字一致)。 */
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

/** Chat 作用域文案,真源:prototype ChatPanel scopeLabels(逐字一致)。 */
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

/** 来源定位精度文案,真源:prototype SourceViewer(逐字一致)。 */
export function anchorPrecisionLabel(precision: string): string {
  switch (precision) {
    case 'exact': return '精确文本'
    case 'unit': return '章节范围'
    case 'page': return '页级范围'
    default: return '无法精确定位'
  }
}
