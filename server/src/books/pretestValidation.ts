import type { PretestQuestion, QuizOption } from './bookTypes.js'

export type PretestValidationCode = 'pretest_invalid'

export class PretestValidationError extends Error {
  readonly code: PretestValidationCode
  /** 校验失败的具体原因（简体中文），供重试提示拼给模型 */
  readonly reason?: string

  constructor(code: PretestValidationCode, reason?: string) {
    super(code)
    this.name = 'PretestValidationError'
    this.code = code
    this.reason = reason
  }
}

const PRETEST_QUESTION_COUNT = 5
const MIN_OPTIONS = 2
const MAX_OPTIONS = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(reason: string): never {
  throw new PretestValidationError('pretest_invalid', reason)
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

/**
 * 校验并归一化摸底题输出：恰好 5 题、每题 2–4 个选项、correctAnswerId 命中选项、
 * chapterId 必须是真实章节 id。任一硬要求不满足即抛 PretestValidationError('pretest_invalid')
 *（摸底题是判定起点的依据，丢弃单题会破坏 5 题契约，故整体判无效重试）。
 * 归一化：题 id 重排为 pq-N，选项 marker 按顺序补 A/B/...，选项缺 id 时补 oN。
 */
export function normalizePretestQuestions(value: unknown, chapterIds: string[]): PretestQuestion[] {
  const record = Array.isArray(value) ? { questions: value } : value
  if (!isRecord(record) || !Array.isArray(record.questions)) {
    invalid('输出不是包含 questions 数组的 JSON 对象')
  }
  if (record.questions.length !== PRETEST_QUESTION_COUNT) {
    invalid(`需要恰好 ${PRETEST_QUESTION_COUNT} 道题`)
  }
  const knownChapterIds = new Set(chapterIds)

  return record.questions.map((entry, index): PretestQuestion => {
    if (!isRecord(entry)) invalid('题目结构非法')
    const question = optionalText(entry.question)
    if (question === null) invalid('题目缺少题干')
    const chapterId = optionalText(entry.chapterId)
    if (chapterId === null || !knownChapterIds.has(chapterId)) {
      invalid('题目 chapterId 不是真实章节 id')
    }
    if (!Array.isArray(entry.options) || entry.options.length < MIN_OPTIONS || entry.options.length > MAX_OPTIONS) {
      invalid('题目需要 2–4 个选项')
    }
    const options: QuizOption[] = entry.options.map((optionValue, optionIndex): QuizOption => {
      if (!isRecord(optionValue)) invalid('选项结构非法')
      const text = optionalText(optionValue.text)
      if (text === null) invalid('选项缺少文本')
      return {
        id: optionalText(optionValue.id) ?? `o${optionIndex + 1}`,
        marker: String.fromCharCode(65 + optionIndex),
        text,
      }
    })
    const correctAnswerId = optionalText(entry.correctAnswerId)
    if (correctAnswerId === null || !options.some((option) => option.id === correctAnswerId)) {
      invalid('题目正确答案与选项不匹配')
    }
    return {
      id: `pq-${index + 1}`,
      chapterId,
      question,
      options,
      correctAnswerId,
      explanation: typeof entry.explanation === 'string' ? entry.explanation.trim() : '',
    }
  })
}
