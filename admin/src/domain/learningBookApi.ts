import type {
  AttemptDiagnosis,
  BookBlock,
  BookChapter,
  BookPretest,
  LearningBook,
  ReviewScheduleEntry,
  SourceAnchor,
} from '../types/learningBook'
import { DIAGNOSIS_TYPES } from '../types/learningBook'

export class BookApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'BookApiError'
    this.code = code
  }
}

export const INVALID_BOOK_PAYLOAD_MESSAGE = '服务端返回了无法识别的学习书数据，请刷新重试。'

const LEARNING_GOALS = ['理解概念', '课程学习', '考试复习'] as const
const LEARNER_LEVELS = ['入门', '了解', '熟悉'] as const
const BOOK_STATUSES = ['proposal', 'generating', 'partial', 'ready', 'error'] as const
const CHAPTER_STATUSES = ['pending', 'generating', 'ready', 'partial', 'error'] as const
const BLOCK_STATUSES = ['pending', 'generating', 'ready', 'error', 'hidden'] as const
const LEARNING_STATES = ['暂无学习记录', '已学习', '待复习'] as const
const RELATION_TYPES = ['前置', '包含', '相似', '对比', '应用'] as const
const RELATION_STATUSES = ['候选', '已确认', '已拒绝'] as const
const EVIDENCE_OUTCOMES = ['mastered', 'review'] as const
const CALLOUT_KINDS = ['key_idea', 'pitfall', 'tip', 'insight'] as const
const FIGURE_KINDS = ['flowchart', 'mindmap', 'timeline', 'sequence'] as const
const REVIEW_KINDS = ['quiz', 'flash_cards'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

/** 错题四类诊断：type 限定四类、advice 必须是非空字符串。 */
export function isAttemptDiagnosis(value: unknown): value is AttemptDiagnosis {
  return isRecord(value)
    && isOneOf(value.type, DIAGNOSIS_TYPES)
    && isString(value.advice)
    && value.advice.length > 0
}

export function isReviewScheduleEntry(value: unknown): value is ReviewScheduleEntry {
  return isRecord(value)
    && isOneOf(value.kind, REVIEW_KINDS)
    && isNumber(value.stage)
    && isNumber(value.lapses)
    && isString(value.dueAt)
    && isString(value.updatedAt)
}

function isSourceAnchor(value: unknown): value is SourceAnchor {
  return isRecord(value)
    && isString(value.sourceId)
    && isString(value.fileName)
    && isString(value.pageRange)
    && isString(value.excerpt)
}

function isSourceAnchors(value: unknown): value is SourceAnchor[] {
  return Array.isArray(value) && value.every(isSourceAnchor)
}

function isBlockBase(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && isString(value.id)
    && isString(value.title)
    && isOneOf(value.status, BLOCK_STATUSES)
    && isNumber(value.revision)
    && isSourceAnchors(value.sourceAnchors)
}

/** 运行时守卫：仅做类型/字段校验，不构造新对象。 */
export function isBookBlock(value: unknown): value is BookBlock {
  if (!isBlockBase(value)) return false
  switch (value.type) {
    case 'explanation':
      return isString(value.body) && isString(value.keyPoint)
    case 'example':
      return isString(value.scenario) && isString(value.takeaway)
    case 'formula':
      return isString(value.formula) && isString(value.explanation)
    case 'citation':
      return isString(value.excerpt) && isString(value.location)
    case 'concept':
      return Array.isArray(value.concepts) && value.concepts.every((item) => (
        isRecord(item)
        && isString(item.id)
        && isString(item.label)
        && isString(item.description)
        && isOneOf(item.learningState, LEARNING_STATES)
      )) && Array.isArray(value.relations) && value.relations.every((item) => (
        isRecord(item)
        && isString(item.id)
        && isString(item.sourceId)
        && isString(item.targetId)
        && isOneOf(item.type, RELATION_TYPES)
        && isNumber(item.confidence)
        && isOneOf(item.status, RELATION_STATUSES)
        && isSourceAnchor(item.sourceAnchor)
      ))
    case 'quiz':
      return isString(value.conceptId)
        && isString(value.question)
        && Array.isArray(value.options) && value.options.every((item) => (
          isRecord(item) && isString(item.id) && isString(item.marker) && isString(item.text)
        ))
        && isString(value.correctAnswerId)
        && isString(value.feedback)
    case 'user_note':
      return isString(value.noteId)
    case 'callout':
      return isOneOf(value.kind, CALLOUT_KINDS) && isString(value.body)
    case 'flash_cards':
      return Array.isArray(value.cards) && value.cards.every((item) => (
        isRecord(item) && isString(item.front) && isString(item.back)
        && (item.hint === undefined || isString(item.hint))
      ))
    case 'figure':
      return isOneOf(value.kind, FIGURE_KINDS) && isString(value.mermaid) && isString(value.caption)
    default:
      return false
  }
}

function isBookChapter(value: unknown): value is BookChapter {
  return isRecord(value)
    && isString(value.id)
    && isString(value.title)
    && isNumber(value.order)
    && isString(value.objective)
    && isString(value.coreConceptId)
    && isNumber(value.estimatedMinutes)
    && isSourceAnchors(value.sourceAnchors)
    && isOneOf(value.status, CHAPTER_STATUSES)
    && Array.isArray(value.blocks)
    && value.blocks.every(isBookBlock)
}

/**
 * pretest 为可选字段：旧书没有，缺失时放行；存在时校验形状。
 * result 为 null（未提交）或完整判定记录。
 */
function isBookPretest(value: unknown): value is BookPretest {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.questions)) return false
  const questionsValid = value.questions.every((item) => (
    isRecord(item)
    && isString(item.id)
    && isString(item.chapterId)
    && isString(item.question)
    && Array.isArray(item.options) && item.options.every((option) => (
      isRecord(option) && isString(option.id) && isString(option.marker) && isString(option.text)
    ))
    && isString(item.correctAnswerId)
    && isString(item.explanation)
  ))
  if (!questionsValid) return false
  if (value.result === null) return true
  return isRecord(value.result)
    && isRecord(value.result.answers)
    && Object.values(value.result.answers).every(isString)
    && isString(value.result.suggestedStartChapterId)
    && Array.isArray(value.result.skippableChapterIds)
    && value.result.skippableChapterIds.every(isString)
    && isString(value.result.submittedAt)
}

/**
 * 校验服务端学习书载荷的 LearningBook 必需字段——
 * StoredBook 多出的 createdAt/updatedAt/generationJobs 等落盘字段随之透传，
 * 类型上由调用方自行取舍。
 * 唯一的归一化：服务端章节 order 为 1..N（proposalEdits 归一化），
 * 而前端阅读页/导航把 order 当 0 基数组下标使用，这里统一降为 0 基。
 */
export function parseLearningBook(value: unknown): LearningBook {
  const valid = isRecord(value)
    && isString(value.id)
    && isRecord(value.source)
    && isString(value.source.id)
    && isString(value.source.fileName)
    && value.source.format === 'PDF'
    && isNumber(value.source.pageCount)
    && isString(value.source.sizeLabel)
    && isString(value.source.updatedLabel)
    && isOneOf(value.goal, LEARNING_GOALS)
    && isOneOf(value.learnerLevel, LEARNER_LEVELS)
    && isRecord(value.proposal)
    && isString(value.proposal.title)
    && isString(value.proposal.description)
    && isString(value.proposal.rationale)
    && isNumber(value.proposal.estimatedMinutes)
    && isOneOf(value.status, BOOK_STATUSES)
    && Array.isArray(value.chapters)
    && value.chapters.every(isBookChapter)
    && isString(value.activeChapterId)
    && Array.isArray(value.userNotes) && value.userNotes.every((item) => (
      isRecord(item)
      && isString(item.id)
      && isString(item.chapterId)
      && isString(item.blockId)
      && isString(item.body)
      && isString(item.createdAt)
    ))
    && Array.isArray(value.quizAttempts) && value.quizAttempts.every((item) => (
      isRecord(item)
      && isString(item.id)
      && isString(item.chapterId)
      && isString(item.blockId)
      && isString(item.answerId)
      && typeof item.isCorrect === 'boolean'
      && isString(item.submittedAt)
      && (item.diagnosis === undefined || item.diagnosis === null || isAttemptDiagnosis(item.diagnosis))
    ))
    && Array.isArray(value.evidence) && value.evidence.every((item) => (
      isRecord(item)
      && isString(item.id)
      && isString(item.chapterId)
      && isString(item.conceptId)
      && isString(item.sourceBlockId)
      && isString(item.statement)
      && isOneOf(item.outcome, EVIDENCE_OUTCOMES)
      && isString(item.createdAt)
    ))
    && (value.pretest === undefined || isBookPretest(value.pretest))
    && (value.reviewSchedule === undefined || (
      isRecord(value.reviewSchedule)
      && Object.values(value.reviewSchedule).every(isReviewScheduleEntry)
    ))
  if (!valid) throw new BookApiError('invalid_book_payload', INVALID_BOOK_PAYLOAD_MESSAGE)
  // 章节按服务端返回顺序（服务端已按 order 排序）归一化为 0 基下标
  for (const [index, chapter] of (value.chapters as BookChapter[]).entries()) chapter.order = index
  return value as unknown as LearningBook
}
