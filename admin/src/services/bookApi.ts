import {
  BookApiError,
  isAttemptDiagnosis,
  isBookBlock,
  isReviewScheduleEntry,
  parseLearningBook,
} from '../domain/learningBookApi'
import type {
  AttemptDiagnosis,
  BookBlock,
  BookPretest,
  LearningBook,
  LearningEvidence,
  LearningGoal,
  LearnerLevel,
  PretestQuestion,
  QuizAttempt,
  ReviewKind,
  ReviewScheduleEntry,
  BankItem,
  UserCard,
  UserNote,
} from '../types/learningBook'
import type { ConceptMastery, LearnerProfile, LearningRhythm } from '../types/learnerProfile'
import {
  createSseFrameParserState,
  parseSseFrames,
  type SseFrameEvent,
  type SseFrameParserState,
} from './sseFrames'

export { BookApiError }

// 服务端落盘结构：LearningBook + 持久化字段（server/src/books/bookTypes.ts 的 StoredBook）
export interface GenerationJob {
  chapterId: string
  status: 'pending' | 'generating' | 'ready' | 'error'
  attempts: number
  lastError: string | null
  updatedAt: string
}

export type StoredBook = LearningBook & {
  createdAt: string
  updatedAt: string
  generationJobs: GenerationJob[]
}

export interface StoredDocumentMeta {
  id: string
  fileName: string
  format: 'PDF' | 'Markdown' | 'DOCX'
  sizeBytes: number
  pageCount: number
  createdAt: string
}

export interface CreateBookInput {
  documentId: string
  goal: LearningGoal
  learnerLevel: LearnerLevel
}

export interface ProposalChapterEdit {
  id: string
  title: string
  order: number
  objective: string
  estimatedMinutes: number
}

export interface ProposalEdits {
  title?: string
  description?: string
  chapters: ProposalChapterEdit[]
}

export type ChapterGenerationEvent =
  | { type: 'chapter_start'; chapterId: string }
  | { type: 'block'; index: number; block: BookBlock }
  | { type: 'chapter_done'; blockCount: number; warnings: string[] }
  | { type: 'error'; code: string; message: string }

export interface StreamChapterGenerationOptions {
  signal?: AbortSignal
  onEvent: (event: ChapterGenerationEvent) => void
}

const SAFE_HTTP_MESSAGE = '学习资料服务暂时不可用，请稍后重试。'
const INVALID_STREAM_MESSAGE = '服务端返回了无法识别的内容，请重试。'
const INCOMPLETE_STREAM_MESSAGE = '生成连接意外中断，请重试。'
const STATUS_ERROR_CODES: Record<number, string> = { 413: 'pdf_too_large' }
const RECOGNIZED_EVENTS = new Set(['chapter_start', 'block', 'chapter_done', 'error'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readHttpError(response: Response): Promise<BookApiError> {
  let code = STATUS_ERROR_CODES[response.status] ?? `http_${response.status}`
  try {
    const value: unknown = await response.json()
    if (isRecord(value) && typeof value.error === 'string' && /^[a-z][a-z0-9_]*$/u.test(value.error)) {
      code = value.error
    }
  } catch {
    // Ignore provider/proxy response bodies and expose only a stable client message.
  }
  return new BookApiError(code, SAFE_HTTP_MESSAGE)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new BookApiError('invalid_book_payload', SAFE_HTTP_MESSAGE)
  }
}

function parseDocumentMeta(value: unknown): StoredDocumentMeta {
  if (
    isRecord(value)
    && typeof value.id === 'string'
    && typeof value.fileName === 'string'
    && (value.format === 'PDF' || value.format === 'Markdown' || value.format === 'DOCX')
    && typeof value.sizeBytes === 'number'
    && typeof value.pageCount === 'number'
    && typeof value.createdAt === 'string'
  ) {
    return value as unknown as StoredDocumentMeta
  }
  throw new BookApiError('invalid_document_payload', SAFE_HTTP_MESSAGE)
}

function parseBookEnvelope(value: unknown): LearningBook {
  return parseLearningBook(isRecord(value) && 'book' in value ? value.book : value)
}

/** 按扩展名推断上传 Content-Type（部分浏览器对 .md 不给具体 MIME） */
function contentTypeFor(file: File): string {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'application/pdf'
}

export async function uploadDocument(file: File): Promise<StoredDocumentMeta> {
  const response = await fetch('/api/documents', {
    method: 'POST',
    headers: {
      'Content-Type': contentTypeFor(file),
      // HTTP 头只能携带 latin-1，中文文件名须百分号编码传输
      'x-file-name': encodeURIComponent(file.name),
    },
    body: file,
  })
  if (!response.ok) throw await readHttpError(response)
  return parseDocumentMeta(await readJson(response))
}

export async function listBooks(): Promise<StoredBook[]> {
  const response = await fetch('/api/books')
  if (!response.ok) throw await readHttpError(response)
  const value = await readJson(response)
  if (!Array.isArray(value)) throw new BookApiError('invalid_book_payload', SAFE_HTTP_MESSAGE)
  return value.map((entry) => parseLearningBook(entry) as StoredBook)
}

export async function createBook(input: CreateBookInput): Promise<LearningBook> {
  const response = await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await readHttpError(response)
  return parseBookEnvelope(await readJson(response))
}

export async function getBook(id: string): Promise<StoredBook> {
  const response = await fetch(`/api/books/${encodeURIComponent(id)}`)
  if (!response.ok) throw await readHttpError(response)
  return parseLearningBook(await readJson(response)) as StoredBook
}

export interface SubmitAttemptResult {
  attempt: QuizAttempt
  evidence: LearningEvidence
  mastery: { chapter: number; concept: number }
  schedule: ReviewScheduleEntry | null
  diagnosis: AttemptDiagnosis | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isQuizAttemptPayload(value: unknown): value is QuizAttempt {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.chapterId === 'string'
    && typeof value.blockId === 'string'
    && typeof value.answerId === 'string'
    && typeof value.isCorrect === 'boolean'
    && typeof value.submittedAt === 'string'
    && (value.diagnosis === undefined || value.diagnosis === null || isAttemptDiagnosis(value.diagnosis))
}

function isLearningEvidencePayload(value: unknown): value is LearningEvidence {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.chapterId === 'string'
    && typeof value.conceptId === 'string'
    && typeof value.sourceBlockId === 'string'
    && typeof value.statement === 'string'
    && (value.outcome === 'mastered' || value.outcome === 'review')
    && typeof value.createdAt === 'string'
}

function parseAttemptResult(value: unknown): SubmitAttemptResult {
  if (
    isRecord(value)
    && isQuizAttemptPayload(value.attempt)
    && isLearningEvidencePayload(value.evidence)
    && isRecord(value.mastery)
    && isFiniteNumber(value.mastery.chapter)
    && isFiniteNumber(value.mastery.concept)
    && 'schedule' in value
    && (value.schedule === null || isReviewScheduleEntry(value.schedule))
    && 'diagnosis' in value
    && (value.diagnosis === null || isAttemptDiagnosis(value.diagnosis))
  ) {
    return {
      attempt: value.attempt,
      evidence: value.evidence,
      mastery: { chapter: value.mastery.chapter, concept: value.mastery.concept },
      schedule: value.schedule,
      diagnosis: value.diagnosis,
    }
  }
  throw new BookApiError('invalid_attempt_payload', SAFE_HTTP_MESSAGE)
}

export async function submitAttempt(bookId: string, blockId: string, answerId: string): Promise<SubmitAttemptResult> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockId, answerId }),
  })
  if (!response.ok) throw await readHttpError(response)
  return parseAttemptResult(await readJson(response))
}

export interface DueItem {
  blockId: string
  chapterId: string
  kind: ReviewKind
  title: string
  dueAt: string
  stage: number
  lapses: number
}

function isDueItemPayload(value: unknown): value is DueItem {
  return isRecord(value)
    && typeof value.blockId === 'string'
    && typeof value.chapterId === 'string'
    && (value.kind === 'quiz' || value.kind === 'flash_cards')
    && typeof value.title === 'string'
    && typeof value.dueAt === 'string'
    && isFiniteNumber(value.stage)
    && isFiniteNumber(value.lapses)
}

function parseReviewDuePayload(value: unknown): DueItem[] {
  if (isRecord(value) && Array.isArray(value.items) && value.items.every(isDueItemPayload)) {
    return value.items
  }
  throw new BookApiError('invalid_review_due_payload', SAFE_HTTP_MESSAGE)
}

export async function getReviewDue(bookId: string): Promise<DueItem[]> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/review/due`)
  if (!response.ok) throw await readHttpError(response)
  return parseReviewDuePayload(await readJson(response))
}

function isUserNotePayload(value: unknown): value is UserNote {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.chapterId === 'string'
    && typeof value.blockId === 'string'
    && typeof value.body === 'string'
    && typeof value.createdAt === 'string'
}

function parseNoteEnvelope(value: unknown): UserNote {
  if (isRecord(value) && isUserNotePayload(value.note)) return value.note
  throw new BookApiError('invalid_note_payload', SAFE_HTTP_MESSAGE)
}

export async function addNote(bookId: string, chapterId: string, blockId: string, body: string): Promise<UserNote> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterId, blockId, body }),
  })
  if (!response.ok) throw await readHttpError(response)
  return parseNoteEnvelope(await readJson(response))
}

export async function deleteNote(bookId: string, noteId: string): Promise<void> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' })
  if (!response.ok) throw await readHttpError(response)
}

/** 导出 Markdown 的直连地址（<a download> 使用，不经 JS 拼文件） */
export function bookExportUrl(bookId: string): string {
  return `/api/books/${encodeURIComponent(bookId)}/export`
}

function isConceptMasteryPayload(value: unknown): value is ConceptMastery {
  return isRecord(value)
    && typeof value.label === 'string'
    && typeof value.displayLabel === 'string'
    && isFiniteNumber(value.mastery)
    && isFiniteNumber(value.attempts)
    && (value.lastOutcome === 'mastered' || value.lastOutcome === 'review' || value.lastOutcome === null)
    && (typeof value.lastAttemptAt === 'string' || value.lastAttemptAt === null)
    && Array.isArray(value.sources)
    && value.sources.every((source) => isRecord(source)
      && typeof source.bookId === 'string'
      && typeof source.chapterId === 'string'
      && typeof source.conceptId === 'string')
    && typeof value.forgettingCliff === 'boolean'
}

function isRhythmPayload(value: unknown): value is LearningRhythm {
  return isRecord(value)
    && isFiniteNumber(value.activeDays30)
    && isFiniteNumber(value.streakDays)
    && isRecord(value.periodDistribution)
    && isFiniteNumber(value.periodDistribution.morning)
    && isFiniteNumber(value.periodDistribution.afternoon)
    && isFiniteNumber(value.periodDistribution.evening)
    && isFiniteNumber(value.periodDistribution.night)
    && isFiniteNumber(value.dailyAverageEvents)
    && typeof value.studiedToday === 'boolean'
}

function parseLearnerProfilePayload(value: unknown): LearnerProfile {
  if (isRecord(value)
    && Array.isArray(value.concepts)
    && value.concepts.every(isConceptMasteryPayload)
    && isRhythmPayload(value.rhythm)
    && typeof value.derivedAt === 'string') {
    return value as unknown as LearnerProfile
  }
  throw new BookApiError('invalid_learner_profile_payload', SAFE_HTTP_MESSAGE)
}

/** 长期学习者模型（只读派生；失败时调用方静默降级，不影响今日页/地图基础行为） */
export async function getLearnerProfile(): Promise<LearnerProfile> {
  const response = await fetch('/api/learner/profile')
  if (!response.ok) throw await readHttpError(response)
  return parseLearnerProfilePayload(await readJson(response))
}

function isBankItemPayload(value: unknown): value is BankItem {
  return isRecord(value)
    && typeof value.blockId === 'string'
    && typeof value.chapterId === 'string'
    && (value.kind === 'quiz' || value.kind === 'flash_cards')
    && typeof value.title === 'string'
    && (typeof value.conceptId === 'string' || value.conceptId === null)
    && (typeof value.conceptLabel === 'string' || value.conceptLabel === null)
    && isFiniteNumber(value.attempts)
    && (typeof value.lastCorrect === 'boolean' || value.lastCorrect === null)
    && isFiniteNumber(value.mastery)
    && (value.schedule === null || (isRecord(value.schedule) && isFiniteNumber(value.schedule.stage) && typeof value.schedule.dueAt === 'string'))
    && typeof value.wrong === 'boolean'
}

function parseBankPayload(value: unknown): BankItem[] {
  if (isRecord(value) && Array.isArray(value.items) && value.items.every(isBankItemPayload)) {
    return value.items
  }
  throw new BookApiError('invalid_bank_payload', SAFE_HTTP_MESSAGE)
}

/** 题库（派生读模型：quiz + flash_cards + 用户问答卡） */
export async function getBank(bookId: string): Promise<BankItem[]> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/bank`)
  if (!response.ok) throw await readHttpError(response)
  return parseBankPayload(await readJson(response))
}

function isUserCardPayload(value: unknown): value is UserCard {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.chapterId === 'string'
    && typeof value.front === 'string'
    && typeof value.back === 'string'
    && (value.hint === undefined || typeof value.hint === 'string')
    && typeof value.createdAt === 'string'
}

export interface AddCardInput {
  chapterId: string
  front: string
  back: string
  hint?: string
}

/** 用户问答卡（对话沉淀「存入题库」） */
export async function addCard(bookId: string, input: AddCardInput): Promise<UserCard> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await readHttpError(response)
  const value = await readJson(response)
  if (isRecord(value) && isUserCardPayload(value.card)) return value.card
  throw new BookApiError('invalid_note_payload', SAFE_HTTP_MESSAGE)
}

function parseReviewResultPayload(value: unknown): ReviewScheduleEntry | null {
  if (isRecord(value) && 'schedule' in value && (value.schedule === null || isReviewScheduleEntry(value.schedule))) {
    return value.schedule
  }
  throw new BookApiError('invalid_review_result_payload', SAFE_HTTP_MESSAGE)
}

export async function submitFlashReview(
  bookId: string,
  blockId: string,
  result: 'remembered' | 'forgotten',
): Promise<ReviewScheduleEntry | null> {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/review/${encodeURIComponent(blockId)}/result`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result }),
    },
  )
  if (!response.ok) throw await readHttpError(response)
  return parseReviewResultPayload(await readJson(response))
}

export interface FeynmanResult {
  passed: boolean
  feedback: string
  gap: string
}

function parseFeynmanResult(value: unknown): FeynmanResult {
  if (
    isRecord(value)
    && typeof value.passed === 'boolean'
    && typeof value.feedback === 'string'
    && typeof value.gap === 'string'
  ) {
    return { passed: value.passed, feedback: value.feedback, gap: value.gap }
  }
  throw new BookApiError('invalid_feynman_payload', SAFE_HTTP_MESSAGE)
}

export async function submitFeynman(bookId: string, chapterId: string, explanation: string): Promise<FeynmanResult> {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterId)}/feynman`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explanation }),
    },
  )
  if (!response.ok) throw await readHttpError(response)
  return parseFeynmanResult(await readJson(response))
}

function isPretestQuestionPayload(value: unknown): value is PretestQuestion {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.chapterId === 'string'
    && typeof value.question === 'string'
    && Array.isArray(value.options) && value.options.every((option) => (
      isRecord(option)
      && typeof option.id === 'string'
      && typeof option.marker === 'string'
      && typeof option.text === 'string'
    ))
    && typeof value.correctAnswerId === 'string'
    && typeof value.explanation === 'string'
}

// pretest 端点返回本体（非 { book } 信封）：{ questions, result }，result 为 null 或完整判定记录
function parsePretestPayload(value: unknown): BookPretest {
  const valid = isRecord(value)
    && Array.isArray(value.questions)
    && value.questions.every(isPretestQuestionPayload)
    && (value.result === null || (
      isRecord(value.result)
      && isRecord(value.result.answers)
      && Object.values(value.result.answers).every((answer) => typeof answer === 'string')
      && typeof value.result.suggestedStartChapterId === 'string'
      && Array.isArray(value.result.skippableChapterIds)
      && value.result.skippableChapterIds.every((id) => typeof id === 'string')
      && typeof value.result.submittedAt === 'string'
    ))
  if (!valid) throw new BookApiError('invalid_pretest_payload', SAFE_HTTP_MESSAGE)
  return value as unknown as BookPretest
}

export async function getPretest(bookId: string): Promise<BookPretest> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/pretest`, { method: 'POST' })
  if (!response.ok) throw await readHttpError(response)
  return parsePretestPayload(await readJson(response))
}

export async function submitPretest(bookId: string, answers: Record<string, string>): Promise<LearningBook> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/pretest/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  if (!response.ok) throw await readHttpError(response)
  return parseBookEnvelope(await readJson(response))
}

export async function updateProposal(id: string, edits: ProposalEdits): Promise<LearningBook> {
  const response = await fetch(`/api/books/${encodeURIComponent(id)}/proposal`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edits),
  })
  if (!response.ok) throw await readHttpError(response)
  return parseBookEnvelope(await readJson(response))
}

export async function confirmBook(id: string): Promise<LearningBook> {
  const response = await fetch(`/api/books/${encodeURIComponent(id)}/confirm`, { method: 'POST' })
  if (!response.ok) throw await readHttpError(response)
  return parseBookEnvelope(await readJson(response))
}

function parseChapterEvent(frame: SseFrameEvent): { event: ChapterGenerationEvent | null; terminal: boolean } {
  if (!RECOGNIZED_EVENTS.has(frame.event)) return { event: null, terminal: false }
  if (frame.data === '') throw new BookApiError('invalid_stream', INVALID_STREAM_MESSAGE)

  let value: unknown
  try {
    value = JSON.parse(frame.data)
  } catch {
    throw new BookApiError('invalid_stream', INVALID_STREAM_MESSAGE)
  }
  if (!isRecord(value)) throw new BookApiError('invalid_stream', INVALID_STREAM_MESSAGE)

  let event: ChapterGenerationEvent | null = null
  if (frame.event === 'chapter_start' && typeof value.chapterId === 'string') {
    event = { type: 'chapter_start', chapterId: value.chapterId }
  }
  if (frame.event === 'block' && typeof value.index === 'number' && isBookBlock(value.block)) {
    event = { type: 'block', index: value.index, block: value.block }
  }
  if (
    frame.event === 'chapter_done'
    && typeof value.blockCount === 'number'
    && Array.isArray(value.warnings)
    && value.warnings.every((item) => typeof item === 'string')
  ) {
    event = { type: 'chapter_done', blockCount: value.blockCount, warnings: value.warnings }
  }
  if (frame.event === 'error' && typeof value.code === 'string' && typeof value.message === 'string') {
    event = { type: 'error', code: value.code, message: value.message }
  }
  if (event === null) throw new BookApiError('invalid_stream', INVALID_STREAM_MESSAGE)
  return { event, terminal: event.type === 'chapter_done' || event.type === 'error' }
}

export async function streamChapterGeneration(
  bookId: string,
  chapterId: string,
  options: StreamChapterGenerationOptions,
): Promise<void> {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterId)}/generate`,
    { method: 'POST', signal: options.signal },
  )
  if (!response.ok) throw await readHttpError(response)
  if (!response.body) throw new BookApiError('invalid_stream', INVALID_STREAM_MESSAGE)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let parserState: SseFrameParserState = createSseFrameParserState()
  let terminal = false
  let reachedNaturalEof = false
  let shouldCancel = false

  const dispatchCompleteFrames = (chunk: string, flush = false): void => {
    const parsed = parseSseFrames(chunk, parserState, flush)
    parserState = parsed.state
    for (const frame of parsed.events) {
      const result = parseChapterEvent(frame)
      if (result.event) options.onEvent(result.event)
      terminal = result.terminal
      if (terminal) return
    }
  }

  try {
    while (!terminal) {
      const { value, done } = await reader.read()
      if (done) {
        reachedNaturalEof = true
        break
      }
      dispatchCompleteFrames(decoder.decode(value, { stream: true }))
    }

    if (terminal && !reachedNaturalEof) shouldCancel = true
    if (!terminal) {
      dispatchCompleteFrames(decoder.decode(), true)
      if (terminal && !reachedNaturalEof) shouldCancel = true
      if (!terminal) throw new BookApiError('incomplete_stream', INCOMPLETE_STREAM_MESSAGE)
    }
  } catch (error) {
    if (!reachedNaturalEof) shouldCancel = true
    throw error
  } finally {
    if (shouldCancel) {
      try {
        await reader.cancel()
      } catch {
        // Cancellation cleanup cannot replace a terminal result or primary parse/callback error.
      }
    }
    try {
      reader.releaseLock()
    } catch {
      // A cleanup failure cannot change the externally observed stream result.
    }
  }
}
