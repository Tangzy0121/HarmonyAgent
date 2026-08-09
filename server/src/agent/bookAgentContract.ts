export type BookAgentValidationCode =
  | 'question_required'
  | 'question_too_long'
  | 'invalid_history'
  | 'invalid_context'
  | 'context_too_large'

export class BookAgentValidationError extends Error {
  readonly code: BookAgentValidationCode

  constructor(code: BookAgentValidationCode) {
    super(code)
    this.name = 'BookAgentValidationError'
    this.code = code
  }
}

export interface NormalizedBookAgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface NormalizedBookAgentSource {
  id: string
  sourceId: string
  fileName: string
  pageRange: string
  excerpt: string
  chapterId: string
  blockId: string
}

export interface NormalizedBookAgentBlock {
  id: string
  type: string
  title: string
  content: string
  sourceIds: string[]
  userAuthored: boolean
}

export interface NormalizedBookAgentChapter {
  id: string
  title: string
  objective: string
  blocks: NormalizedBookAgentBlock[]
}

export interface NormalizedBookAgentContext {
  bookId: string
  title: string
  scope: 'chapter' | 'book'
  label: string
  focusBlockId?: string
  chapters: NormalizedBookAgentChapter[]
  sources: NormalizedBookAgentSource[]
  warnings: string[]
}

export interface NormalizedBookAgentRequest {
  question: string
  history: NormalizedBookAgentHistoryMessage[]
  context: NormalizedBookAgentContext | null
}

const MAX_QUESTION_CHARACTERS = 2_000
const MAX_HISTORY_MESSAGES = 6
const MAX_HISTORY_MESSAGE_CHARACTERS = 4_000
const MAX_SOURCES = 20
const MAX_CHAPTERS = 8
const MAX_BLOCKS = 40
const MAX_CONTEXT_CHARACTERS = 24_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string') throw new BookAgentValidationError('invalid_context')
  const normalized = normalizeWhitespace(value)
  if (!normalized) throw new BookAgentValidationError('invalid_context')
  return normalized
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) throw new BookAgentValidationError('invalid_context')
  return value.map(requiredText)
}

function normalizeHistory(value: unknown): NormalizedBookAgentHistoryMessage[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new BookAgentValidationError('invalid_history')

  const messages = value.map((entry): NormalizedBookAgentHistoryMessage => {
    if (!isRecord(entry) || (entry.role !== 'user' && entry.role !== 'assistant')) {
      throw new BookAgentValidationError('invalid_history')
    }
    if (typeof entry.content !== 'string') throw new BookAgentValidationError('invalid_history')
    const content = normalizeWhitespace(entry.content)
    if (!content) throw new BookAgentValidationError('invalid_history')
    return {
      role: entry.role,
      content: content.slice(0, MAX_HISTORY_MESSAGE_CHARACTERS),
    }
  })
  return messages.slice(-MAX_HISTORY_MESSAGES)
}

function normalizeContext(value: unknown): NormalizedBookAgentContext | null {
  if (value === undefined || value === null) return null
  if (!isRecord(value)) throw new BookAgentValidationError('invalid_context')
  if (value.scope !== 'chapter' && value.scope !== 'book') {
    throw new BookAgentValidationError('invalid_context')
  }
  if (!Array.isArray(value.chapters) || value.chapters.length > MAX_CHAPTERS) {
    throw new BookAgentValidationError('invalid_context')
  }
  if (!Array.isArray(value.sources) || !Array.isArray(value.warnings)) {
    throw new BookAgentValidationError('invalid_context')
  }

  const chapterIds = new Set<string>()
  const blockIds = new Set<string>()
  let blockCount = 0
  const chapters = value.chapters.map((chapterValue): NormalizedBookAgentChapter => {
    if (!isRecord(chapterValue) || !Array.isArray(chapterValue.blocks)) {
      throw new BookAgentValidationError('invalid_context')
    }
    const id = requiredText(chapterValue.id)
    if (chapterIds.has(id)) throw new BookAgentValidationError('invalid_context')
    chapterIds.add(id)
    blockCount += chapterValue.blocks.length
    if (blockCount > MAX_BLOCKS) throw new BookAgentValidationError('invalid_context')

    const blocks = chapterValue.blocks.map((blockValue): NormalizedBookAgentBlock => {
      if (!isRecord(blockValue) || typeof blockValue.userAuthored !== 'boolean') {
        throw new BookAgentValidationError('invalid_context')
      }
      const blockId = requiredText(blockValue.id)
      if (blockIds.has(blockId)) throw new BookAgentValidationError('invalid_context')
      blockIds.add(blockId)
      return {
        id: blockId,
        type: requiredText(blockValue.type),
        title: requiredText(blockValue.title),
        content: requiredText(blockValue.content),
        sourceIds: stringArray(blockValue.sourceIds),
        userAuthored: blockValue.userAuthored,
      }
    })

    return {
      id,
      title: requiredText(chapterValue.title),
      objective: requiredText(chapterValue.objective),
      blocks,
    }
  })

  const sourceIds = new Set<string>()
  const sources = value.sources.map((sourceValue): NormalizedBookAgentSource => {
    if (!isRecord(sourceValue)) throw new BookAgentValidationError('invalid_context')
    const id = requiredText(sourceValue.id)
    if (!/^S[1-9]\d*$/u.test(id) || sourceIds.has(id)) {
      throw new BookAgentValidationError('invalid_context')
    }
    sourceIds.add(id)
    const chapterId = requiredText(sourceValue.chapterId)
    const blockId = requiredText(sourceValue.blockId)
    if (!chapterIds.has(chapterId) || !blockIds.has(blockId)) {
      throw new BookAgentValidationError('invalid_context')
    }
    return {
      id,
      sourceId: requiredText(sourceValue.sourceId),
      fileName: requiredText(sourceValue.fileName),
      pageRange: requiredText(sourceValue.pageRange),
      excerpt: requiredText(sourceValue.excerpt),
      chapterId,
      blockId,
    }
  })

  for (const chapter of chapters) {
    for (const block of chapter.blocks) {
      if (block.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
        throw new BookAgentValidationError('invalid_context')
      }
    }
  }

  const retainedSourceIds = new Set(sources.slice(0, MAX_SOURCES).map((source) => source.id))
  const context: NormalizedBookAgentContext = {
    bookId: requiredText(value.bookId),
    title: requiredText(value.title),
    scope: value.scope,
    label: requiredText(value.label),
    ...(value.focusBlockId === undefined
      ? {}
      : { focusBlockId: requiredText(value.focusBlockId) }),
    chapters: chapters.map((chapter) => ({
      ...chapter,
      blocks: chapter.blocks.map((block) => ({
        ...block,
        sourceIds: block.sourceIds.filter((sourceId) => retainedSourceIds.has(sourceId)),
      })),
    })),
    sources: sources.slice(0, MAX_SOURCES),
    warnings: value.warnings.map(requiredText),
  }

  if (JSON.stringify(context).length > MAX_CONTEXT_CHARACTERS) {
    throw new BookAgentValidationError('context_too_large')
  }
  return context
}

export function normalizeBookAgentRequest(value: unknown): NormalizedBookAgentRequest {
  if (!isRecord(value) || typeof value.question !== 'string') {
    throw new BookAgentValidationError('question_required')
  }
  const question = normalizeWhitespace(value.question)
  if (!question) throw new BookAgentValidationError('question_required')
  if (question.length > MAX_QUESTION_CHARACTERS) {
    throw new BookAgentValidationError('question_too_long')
  }

  return {
    question,
    history: normalizeHistory(value.history),
    context: normalizeContext(value.context),
  }
}
