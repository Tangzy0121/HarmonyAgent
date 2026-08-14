import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import type { RuntimeActor } from '../agent/runtime/agentRuntimeTypes.js'
import type { BookStore } from '../books/bookStore.js'
import type {
  AttemptDiagnosis,
  LearningEvidence,
  LearningEvidenceV1,
  QuizAttempt,
  QuizLearningEvidenceV1,
  StoredBook,
} from '../books/bookTypes.js'
import { applyReviewGrade } from '../books/schedule.js'
import {
  MasteryProjector,
  type MasteryProjection,
  type MasteryProjectionScope,
} from './masteryProjector.js'
import type { EvidenceReceiptKeyring } from './evidenceSecurityKeys.js'

export type ProjectionStatus = 'projected' | 'pending'

export type LearningEvidenceServiceErrorCode =
  | 'invalid_actor_scope'
  | 'book_not_found'
  | 'quiz_not_found'
  | 'invalid_answer'
  | 'chapter_not_found'
  | 'review_target_invalid'
  | 'evidence_id_conflict'
  | 'evidence_receipt_invalid'
  | 'evidence_receipt_expired'
  | 'evidence_scope_invalid'

export class LearningEvidenceServiceError extends Error {
  readonly code: LearningEvidenceServiceErrorCode

  constructor(code: LearningEvidenceServiceErrorCode) {
    super(code)
    this.name = 'LearningEvidenceServiceError'
    this.code = code
  }
}

interface LearningEvidenceServiceDependencies {
  bookStore: BookStore
  owner: RuntimeActor
  projector?: MasteryProjector
  now?: () => Date
  createId?: () => string
  receiptSecret?: string
  receiptKeyring?: EvidenceReceiptKeyring
  feynmanDigestKey?: string
}

export interface ProjectionResult {
  projectionStatus: ProjectionStatus
  mastery?: MasteryProjection
}

export interface AppendEvidenceResult extends ProjectionResult {
  evidence: LearningEvidenceV1
  appended: boolean
}

type LearningEvidenceDraft = LearningEvidenceV1 extends infer Evidence
  ? Evidence extends LearningEvidenceV1
    ? Omit<Evidence, 'id' | 'createdAt'>
    : never
  : never

export type ServerEvidenceReceipt = string

interface EvidenceReceiptClaims {
  version: '1'
  purpose: 'append_learning_evidence'
  keyId: string
  userId: string
  workspaceId: string
  bookId: string
  evidence: LearningEvidenceV1
  issuedAt: string
  expiresAt: string
  nonce: string
}

function isV1(item: LearningEvidence | undefined): item is LearningEvidenceV1 {
  return item !== undefined && 'version' in item && item.version === '1' && 'kind' in item
}

function v1Evidence(book: StoredBook): LearningEvidenceV1[] {
  return book.evidence.filter(isV1)
}

function sameActor(left: RuntimeActor, right: RuntimeActor): boolean {
  return left.userId === right.userId && left.workspaceId === right.workspaceId
}

function quizConceptId(book: StoredBook, blockId: string): string {
  const block = book.chapters
    .flatMap((chapter) => chapter.blocks)
    .find((candidate) => candidate.id === blockId)
  return block?.type === 'quiz' ? block.conceptId : ''
}

function evidenceMatchesBook(book: StoredBook, evidence: LearningEvidenceV1): boolean {
  const chapter = book.chapters.find((candidate) => candidate.id === evidence.chapterId)
  if (!chapter) return false
  if (evidence.kind === 'feynman') {
    return evidence.sourceBlockId === chapter.id && evidence.conceptId === chapter.coreConceptId
  }
  const block = chapter.blocks.find((candidate) => candidate.id === evidence.sourceBlockId)
  if (!block) return false
  if (evidence.kind === 'quiz') {
    if (block.type !== 'quiz' || evidence.conceptId !== block.conceptId) return false
    return book.quizAttempts.some((attempt) =>
      attempt.id === evidence.payload.attemptId &&
      attempt.chapterId === evidence.chapterId &&
      attempt.blockId === evidence.sourceBlockId &&
      attempt.answerId === evidence.payload.answerId &&
      attempt.isCorrect === evidence.payload.isCorrect &&
      attempt.submittedAt === evidence.createdAt)
  }
  if (evidence.payload.reviewKind === 'quiz') {
    return block.type === 'quiz' && evidence.conceptId === block.conceptId
  }
  return block.type === 'flash_cards' && evidence.conceptId === chapter.coreConceptId
}

/**
 * Read migration for old books. IDs derived from attempt IDs make repeated reads idempotent.
 * A matching legacy quiz evidence is upgraded in place so existing evidence IDs remain stable.
 */
export function migrateLegacyLearningEvidence(book: StoredBook): void {
  const candidate = book as StoredBook & { evidence?: LearningEvidence[] }
  candidate.evidence ??= []
  book.evidence = candidate.evidence
  for (const attempt of book.quizAttempts ?? []) {
    const deterministicId = `evidence_quiz_${attempt.id}`
    const alreadyV1 = book.evidence.some((item) =>
      isV1(item) && item.kind === 'quiz' && item.payload.attemptId === attempt.id)
    if (alreadyV1) continue
    const legacyIndex = book.evidence.findIndex((item) =>
      !isV1(item) &&
      item.chapterId === attempt.chapterId &&
      item.sourceBlockId === attempt.blockId &&
      item.createdAt === attempt.submittedAt)
    const legacy = legacyIndex >= 0 ? book.evidence[legacyIndex] : undefined
    const migrated: QuizLearningEvidenceV1 = {
      version: '1',
      id: legacy?.id ?? deterministicId,
      kind: 'quiz',
      chapterId: attempt.chapterId,
      conceptId: legacy?.conceptId ?? quizConceptId(book, attempt.blockId),
      sourceBlockId: attempt.blockId,
      statement: legacy?.statement ?? (attempt.isCorrect ? '答对' : '答错待复习'),
      outcome: attempt.isCorrect ? 'mastered' : 'review',
      createdAt: attempt.submittedAt,
      payload: {
        attemptId: attempt.id,
        answerId: attempt.answerId,
        isCorrect: attempt.isCorrect,
      },
    }
    if (legacyIndex >= 0) book.evidence[legacyIndex] = migrated
    else book.evidence.push(migrated)
  }
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function constantTimeEqual(left: Buffer, right: Buffer): boolean {
  const comparableRight = Buffer.alloc(left.length)
  right.copy(comparableRight, 0, 0, left.length)
  const equal = timingSafeEqual(left, comparableRight)
  return right.length === left.length && equal
}

function projectionKey(scope: MasteryProjectionScope, evidenceId: string): string {
  return createHash('sha256')
    .update(`${scope.chapterId}\u0000${scope.conceptId}\u0000${scope.sourceBlockId ?? ''}\u0000${evidenceId}`)
    .digest('hex')
}

function enqueueProjection(
  book: StoredBook,
  scope: MasteryProjectionScope,
  evidenceId: string,
  createdAt: string,
): string {
  const id = projectionKey(scope, evidenceId)
  book.projectionOutbox = {
    ...(book.projectionOutbox ?? {}),
    [id]: {
      id,
      chapterId: scope.chapterId,
      conceptId: scope.conceptId,
      sourceBlockId: scope.sourceBlockId ?? '',
      evidenceId,
      createdAt,
      attempts: book.projectionOutbox?.[id]?.attempts ?? 0,
      ...(book.projectionOutbox?.[id]?.lastAttemptAt
        ? { lastAttemptAt: book.projectionOutbox[id].lastAttemptAt }
        : {}),
    },
  }
  return id
}

type ProjectionOutboxEntry = NonNullable<StoredBook['projectionOutbox']>[string]

function isProjectionOutboxEntry(value: unknown): value is ProjectionOutboxEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entry = value as Partial<ProjectionOutboxEntry>
  return typeof entry.id === 'string' && Boolean(entry.id) &&
    typeof entry.chapterId === 'string' && typeof entry.conceptId === 'string' &&
    typeof entry.sourceBlockId === 'string' && typeof entry.evidenceId === 'string'
}

export class LearningEvidenceService {
  private readonly bookStore: BookStore
  private readonly owner: RuntimeActor
  private readonly projector: MasteryProjector
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly receiptKeyring: EvidenceReceiptKeyring
  private readonly feynmanDigestKey: string

  constructor(dependencies: LearningEvidenceServiceDependencies) {
    this.bookStore = dependencies.bookStore
    this.owner = { ...dependencies.owner }
    this.projector = dependencies.projector ?? new MasteryProjector()
    this.now = dependencies.now ?? (() => new Date())
    this.createId = dependencies.createId ?? (() => randomUUID())
    const compatibilitySecret = dependencies.receiptSecret ?? randomUUID()
    this.receiptKeyring = dependencies.receiptKeyring ?? {
      active: { id: 'compatibility', secret: compatibilitySecret }, verification: [],
    }
    this.feynmanDigestKey = dependencies.feynmanDigestKey ?? createHmac(
      'sha256', this.receiptKeyring.active.secret,
    ).update('harmony-agent:feynman-digest:v1').digest('base64url')
  }

  private async getBook(actor: RuntimeActor, bookId: string): Promise<StoredBook> {
    if (!sameActor(actor, this.owner)) {
      throw new LearningEvidenceServiceError('invalid_actor_scope')
    }
    const book = await this.bookStore.get(bookId)
    if (!book) throw new LearningEvidenceServiceError('book_not_found')
    migrateLegacyLearningEvidence(book)
    return book
  }

  private async updateBook<T>(
    actor: RuntimeActor,
    bookId: string,
    mutator: (book: StoredBook) => T | Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ book: StoredBook; result: T }> {
    if (!sameActor(actor, this.owner)) {
      throw new LearningEvidenceServiceError('invalid_actor_scope')
    }
    try {
      return await this.bookStore.update(bookId, (book) => {
        migrateLegacyLearningEvidence(book)
        signal?.throwIfAborted()
        return mutator(book)
      })
    } catch (error) {
      if (
        error instanceof Error &&
        (error as Error & { code?: unknown }).code === 'book_not_found'
      ) {
        throw new LearningEvidenceServiceError('book_not_found')
      }
      throw error
    }
  }

  private async projectAndTrack(
    actor: RuntimeActor,
    book: StoredBook,
    scope: MasteryProjectionScope,
    pendingId?: string,
    signal?: AbortSignal,
  ): Promise<ProjectionResult> {
    const key = pendingId ?? projectionKey(scope, 'manual')
    try {
      const projected = await this.updateBook(actor, book.id, (current) => {
        const mastery = this.projector.project(v1Evidence(current), scope)
        const pending = current.projectionOutbox?.[key]
        if (pending) {
          current.masteryProjectionReadModel = {
            ...(current.masteryProjectionReadModel ?? {}),
            [pending.evidenceId]: {
              evidenceId: pending.evidenceId,
              chapterId: scope.chapterId,
              conceptId: scope.conceptId,
              sourceBlockId: scope.sourceBlockId ?? '',
              mastery,
              status: 'projected',
              projectedAt: this.now().toISOString(),
            },
          }
          const next = { ...current.projectionOutbox }
          delete next[key]
          current.projectionOutbox = next
        }
        return mastery
      }, signal)
      return { projectionStatus: 'projected', mastery: projected.result }
    } catch {
      signal?.throwIfAborted()
      try {
        await this.updateBook(actor, book.id, (current) => {
          const pending = current.projectionOutbox?.[key]
          if (!pending) return
          pending.attempts += 1
          pending.lastAttemptAt = this.now().toISOString()
        })
      } catch {
        // Evidence and the original pending entry were already committed atomically.
      }
      return { projectionStatus: 'pending' }
    }
  }

  async reproject(
    actor: RuntimeActor,
    bookId: string,
    scope: MasteryProjectionScope,
  ): Promise<ProjectionResult> {
    const book = await this.getBook(actor, bookId)
    const matching = Object.values(book.projectionOutbox ?? {}).filter((entry) =>
      entry.chapterId === scope.chapterId &&
      entry.conceptId === scope.conceptId &&
      entry.sourceBlockId === (scope.sourceBlockId ?? ''))
    if (matching.length === 0) return this.projectAndTrack(actor, book, scope)
    let last: ProjectionResult = { projectionStatus: 'projected' }
    for (const entry of matching) {
      last = await this.projectAndTrack(actor, await this.getBook(actor, bookId), scope, entry.id)
      if (last.projectionStatus === 'pending') return last
    }
    return last
  }

  async drainProjectionOutbox(actor: RuntimeActor): Promise<{ projected: number; pending: number }> {
    if (!sameActor(actor, this.owner)) {
      throw new LearningEvidenceServiceError('invalid_actor_scope')
    }
    let projected = 0
    let pending = 0
    const bookIds = this.bookStore.listIds
      ? await this.bookStore.listIds()
      : (await this.bookStore.list()).map((book) => book.id)
    for (const bookId of bookIds) {
      let entries: unknown[]
      try {
        const book = await this.getBook(actor, bookId)
        entries = Object.values(book.projectionOutbox ?? {})
      } catch {
        pending += 1
        continue
      }
      for (const candidate of entries) {
        if (!isProjectionOutboxEntry(candidate)) {
          pending += 1
          continue
        }
        try {
          const fresh = await this.getBook(actor, bookId)
          const current = fresh.projectionOutbox?.[candidate.id]
          if (!current) continue
          if (!isProjectionOutboxEntry(current)) {
            pending += 1
            continue
          }
          const result = await this.projectAndTrack(actor, fresh, {
            chapterId: current.chapterId,
            conceptId: current.conceptId,
            sourceBlockId: current.sourceBlockId,
          }, current.id)
          if (result.projectionStatus === 'projected') projected += 1
          else pending += 1
        } catch {
          pending += 1
        }
      }
    }
    return { projected, pending }
  }

  async appendEvidence(
    actor: RuntimeActor,
    bookId: string,
    receipt: ServerEvidenceReceipt,
    signal?: AbortSignal,
  ): Promise<AppendEvidenceResult> {
    const evidence = this.verifyEvidenceReceipt(actor, bookId, receipt).evidence
    const updated = await this.updateBook(actor, bookId, (book) => {
      if (!evidenceMatchesBook(book, evidence)) {
        throw new LearningEvidenceServiceError('evidence_scope_invalid')
      }
      const existing = book.evidence.find((item) => item.id === evidence.id)
      const appended = existing === undefined
      if (existing !== undefined && (
        !isV1(existing) || canonicalize(existing) !== canonicalize(evidence)
      )) {
        throw new LearningEvidenceServiceError('evidence_id_conflict')
      }
      if (appended) {
        book.evidence.push(structuredClone(evidence))
        book.updatedAt = evidence.createdAt
      }
      const pendingId = enqueueProjection(book, {
        chapterId: evidence.chapterId,
        conceptId: evidence.conceptId,
        sourceBlockId: evidence.sourceBlockId,
      }, evidence.id, evidence.createdAt)
      return { existing, appended, pendingId }
    }, signal)
    const { existing, appended, pendingId } = updated.result
    const stored = isV1(existing) ? existing : evidence
    return {
      evidence: stored,
      appended,
      ...await this.projectAndTrack(actor, updated.book, {
        chapterId: stored.chapterId,
        conceptId: stored.conceptId,
        sourceBlockId: stored.sourceBlockId,
      }, pendingId, signal),
    }
  }

  issueEvidenceReceipt(
    actor: RuntimeActor,
    bookId: string,
    draft: LearningEvidenceDraft,
    options: { ttlMs?: number } = {},
  ): ServerEvidenceReceipt {
    if (!sameActor(actor, this.owner)) {
      throw new LearningEvidenceServiceError('invalid_actor_scope')
    }
    const issued = this.now()
    const ttlMs = options.ttlMs !== undefined && Number.isFinite(options.ttlMs) && options.ttlMs > 0
      ? options.ttlMs
      : 5 * 60_000
    const evidence = {
      ...structuredClone(draft),
      id: `evidence_${this.createId()}`,
      createdAt: issued.toISOString(),
    } as LearningEvidenceV1
    const claims: EvidenceReceiptClaims = {
      version: '1', purpose: 'append_learning_evidence', keyId: this.receiptKeyring.active.id,
      userId: actor.userId, workspaceId: actor.workspaceId, bookId, evidence,
      issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + ttlMs).toISOString(),
      nonce: randomUUID(),
    }
    const payload = Buffer.from(canonicalize(claims)).toString('base64url')
    const signature = createHmac('sha256', this.receiptKeyring.active.secret)
      .update(payload).digest('base64url')
    return `${payload}.${signature}`
  }

  private verifyEvidenceReceipt(
    actor: RuntimeActor,
    bookId: string,
    receipt: ServerEvidenceReceipt,
  ): EvidenceReceiptClaims {
    try {
      if (typeof receipt !== 'string' || receipt.length > 64 * 1024) throw new Error()
      const parts = receipt.split('.')
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error()
      const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as EvidenceReceiptClaims
      const key = [this.receiptKeyring.active, ...this.receiptKeyring.verification]
        .find((candidate) => candidate.id === claims.keyId)
      if (!key) throw new Error()
      const expected = createHmac('sha256', key.secret).update(parts[0]).digest()
      const received = Buffer.from(parts[1], 'base64url')
      if (!constantTimeEqual(expected, received)) throw new Error()
      if (
        claims.version !== '1' || claims.purpose !== 'append_learning_evidence' ||
        claims.userId !== actor.userId || claims.workspaceId !== actor.workspaceId ||
        claims.bookId !== bookId || typeof claims.nonce !== 'string' || !claims.nonce ||
        !Number.isFinite(Date.parse(claims.issuedAt)) || !Number.isFinite(Date.parse(claims.expiresAt)) ||
        Date.parse(claims.issuedAt) > Date.parse(claims.expiresAt)
      ) throw new Error()
      if (this.now().getTime() > Date.parse(claims.expiresAt)) {
        throw new LearningEvidenceServiceError('evidence_receipt_expired')
      }
      return claims
    } catch (error) {
      if (error instanceof LearningEvidenceServiceError) throw error
      throw new LearningEvidenceServiceError('evidence_receipt_invalid')
    }
  }

  async issueFeynmanEvidenceReceipt(actor: RuntimeActor, input: {
    bookId: string
    chapterId: string
    confirmedText: string
    result: { passed: boolean; feedback: string; gap: string }
    ttlMs?: number
    signal?: AbortSignal
  }): Promise<ServerEvidenceReceipt> {
    const book = await this.getBook(actor, input.bookId)
    input.signal?.throwIfAborted()
    const chapter = book.chapters.find((candidate) => candidate.id === input.chapterId)
    if (!chapter) throw new LearningEvidenceServiceError('chapter_not_found')
    return this.issueEvidenceReceipt(actor, input.bookId, {
      version: '1',
      kind: 'feynman',
      chapterId: chapter.id,
      conceptId: chapter.coreConceptId,
      sourceBlockId: chapter.id,
      statement: input.result.passed ? '费曼复述通过' : '费曼复述待补充',
      outcome: input.result.passed ? 'mastered' : 'review',
      payload: {
        confirmedTextDigest: createHmac('sha256', this.feynmanDigestKey)
          .update(input.confirmedText).digest('hex'),
        confirmedTextLength: input.confirmedText.length,
        passed: input.result.passed,
        feedbackCategory: input.result.passed ? 'positive' : 'needs_review',
        gapCategory: input.result.gap.trim() === '' ? 'none' : 'has_gap',
      },
    }, { ttlMs: input.ttlMs })
  }

  async recordQuiz(actor: RuntimeActor, input: {
    bookId: string
    blockId: string
    answerId: string
    diagnosis?: AttemptDiagnosis | null
    signal?: AbortSignal
  }): Promise<{
    attempt: QuizAttempt
    evidence: QuizLearningEvidenceV1
    schedule: NonNullable<StoredBook['reviewSchedule']>[string] | null
    diagnosis: AttemptDiagnosis | null
  } & ProjectionResult> {
    const updated = await this.updateBook(actor, input.bookId, (book) => {
      const chapter = book.chapters.find((entry) =>
        entry.blocks.some((block) => block.id === input.blockId))
      const block = chapter?.blocks.find((entry) => entry.id === input.blockId)
      if (!chapter || !block || block.type !== 'quiz') {
        throw new LearningEvidenceServiceError('quiz_not_found')
      }
      if (!block.options.some((option) => option.id === input.answerId)) {
        throw new LearningEvidenceServiceError('invalid_answer')
      }
      const createdAt = this.now().toISOString()
      const isCorrect = input.answerId === block.correctAnswerId
      const attempt: QuizAttempt = {
        id: `attempt_${this.createId()}`,
        chapterId: chapter.id,
        blockId: block.id,
        answerId: input.answerId,
        isCorrect,
        submittedAt: createdAt,
        diagnosis: input.diagnosis ?? null,
      }
      const evidence: QuizLearningEvidenceV1 = {
        version: '1',
        id: `evidence_${this.createId()}`,
        kind: 'quiz',
        chapterId: chapter.id,
        conceptId: block.conceptId,
        sourceBlockId: block.id,
        statement: `${isCorrect ? '答对' : '答错待复习'}：${block.question.slice(0, 80)}`,
        outcome: isCorrect ? 'mastered' : 'review',
        createdAt,
        payload: { attemptId: attempt.id, answerId: input.answerId, isCorrect },
      }
      book.quizAttempts.push(attempt)
      book.evidence.push(evidence)
      const scheduleMap = { ...(book.reviewSchedule ?? {}) }
      const schedule = applyReviewGrade(
        scheduleMap[block.id], 'quiz', isCorrect, new Date(createdAt),
      )
      if (schedule === null) delete scheduleMap[block.id]
      else scheduleMap[block.id] = schedule
      book.reviewSchedule = scheduleMap
      book.updatedAt = createdAt
      const pendingId = enqueueProjection(book, {
        chapterId: chapter.id,
        conceptId: block.conceptId,
        sourceBlockId: block.id,
      }, evidence.id, createdAt)
      return { attempt, evidence, schedule, chapterId: chapter.id, conceptId: block.conceptId, pendingId }
    }, input.signal)
    const { attempt, evidence, schedule, chapterId, conceptId, pendingId } = updated.result
    return {
      attempt,
      evidence,
      schedule,
      diagnosis: attempt.diagnosis ?? null,
      ...await this.projectAndTrack(actor, updated.book, {
        chapterId,
        conceptId,
        sourceBlockId: input.blockId,
      }, pendingId, input.signal),
    }
  }

  async recordFeynman(actor: RuntimeActor, input: {
    bookId: string
    chapterId: string
    confirmedText: string
    result: { passed: boolean; feedback: string; gap: string }
    signal?: AbortSignal
  }): Promise<AppendEvidenceResult> {
    const updated = await this.updateBook(actor, input.bookId, (book) => {
      const chapter = book.chapters.find((candidate) => candidate.id === input.chapterId)
      if (!chapter) throw new LearningEvidenceServiceError('chapter_not_found')
      const createdAt = this.now().toISOString()
      const evidence: LearningEvidenceV1 = {
        version: '1',
        id: `evidence_${this.createId()}`,
        kind: 'feynman',
        chapterId: chapter.id,
        conceptId: chapter.coreConceptId,
        sourceBlockId: chapter.id,
        statement: input.result.passed ? '费曼复述通过' : '费曼复述待补充',
        outcome: input.result.passed ? 'mastered' : 'review',
        createdAt,
        payload: {
          confirmedTextDigest: createHmac('sha256', this.feynmanDigestKey)
            .update(input.confirmedText).digest('hex'),
          confirmedTextLength: input.confirmedText.length,
          passed: input.result.passed,
          feedbackCategory: input.result.passed ? 'positive' : 'needs_review',
          gapCategory: input.result.gap.trim() === '' ? 'none' : 'has_gap',
        },
      }
      book.evidence.push(evidence)
      book.updatedAt = createdAt
      const pendingId = enqueueProjection(book, {
        chapterId: chapter.id,
        conceptId: chapter.coreConceptId,
        sourceBlockId: chapter.id,
      }, evidence.id, createdAt)
      return { evidence, pendingId }
    }, input.signal)
    return {
      evidence: updated.result.evidence,
      appended: true,
      ...await this.projectAndTrack(actor, updated.book, {
        chapterId: updated.result.evidence.chapterId,
        conceptId: updated.result.evidence.conceptId,
        sourceBlockId: updated.result.evidence.sourceBlockId,
      }, updated.result.pendingId, input.signal),
    }
  }

  async recordReview(actor: RuntimeActor, input: {
    bookId: string
    blockId: string
    result: 'remembered' | 'forgotten'
    signal?: AbortSignal
  }): Promise<{
    evidence: LearningEvidenceV1
    schedule: NonNullable<StoredBook['reviewSchedule']>[string] | null
  } & ProjectionResult> {
    const updated = await this.updateBook(actor, input.bookId, (book) => {
      const chapter = book.chapters.find((entry) =>
        entry.blocks.some((block) => block.id === input.blockId))
      const block = chapter?.blocks.find((entry) => entry.id === input.blockId)
      if (!chapter || !block || block.type !== 'flash_cards') {
        throw new LearningEvidenceServiceError('review_target_invalid')
      }
      const now = this.now()
      const createdAt = now.toISOString()
      const remembered = input.result === 'remembered'
      const scheduleMap = { ...(book.reviewSchedule ?? {}) }
      const schedule = applyReviewGrade(scheduleMap[block.id], 'flash_cards', remembered, now)
      if (schedule === null) delete scheduleMap[block.id]
      else scheduleMap[block.id] = schedule
      const evidence: LearningEvidenceV1 = {
        version: '1', id: `evidence_${this.createId()}`, kind: 'review',
        chapterId: chapter.id, conceptId: chapter.coreConceptId, sourceBlockId: block.id,
        statement: remembered ? '复习记住' : '复习遗忘',
        outcome: remembered ? 'mastered' : 'review', createdAt,
        payload: { reviewKind: 'flash_cards', remembered },
      }
      book.evidence.push(evidence)
      book.reviewSchedule = scheduleMap
      book.updatedAt = createdAt
      const pendingId = enqueueProjection(book, {
        chapterId: chapter.id,
        conceptId: chapter.coreConceptId,
        sourceBlockId: block.id,
      }, evidence.id, createdAt)
      return { evidence, schedule, chapterId: chapter.id, conceptId: chapter.coreConceptId, pendingId }
    }, input.signal)
    const { evidence, schedule, chapterId, conceptId, pendingId } = updated.result
    return {
      evidence,
      schedule,
      ...await this.projectAndTrack(actor, updated.book, {
        chapterId, conceptId, sourceBlockId: input.blockId,
      }, pendingId, input.signal),
    }
  }
}
