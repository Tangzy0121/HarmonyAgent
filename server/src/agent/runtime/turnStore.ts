import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createAgentEvent, type AgentEventEnvelopeV1, type AgentEventType } from './agentEvent.js'
import type {
  AgentObjectRefs,
  CapabilityId,
  RuntimeActor,
  StartTurnRequestV1,
  TurnStatus,
} from './agentRuntimeTypes.js'

export interface PendingQuestion {
  questionId: string
  prompt: string
  options: string[]
  allowFreeText: boolean
  askedAt: string
}

export interface Checkpoint {
  capabilityId: CapabilityId
  refs: AgentObjectRefs
  confirmedOutput: string
  completedSteps: string[]
  selectionStep?: 'book' | 'chapter'
}

export interface TurnAnswer {
  questionId: string
  answer: string
  idempotencyKey: string
  answeredAt: string
}

export interface TurnRecord {
  version: '1'
  turnId: string
  actor: RuntimeActor
  request: StartTurnRequestV1
  capabilityId: CapabilityId
  status: TurnStatus
  createdAt: string
  updatedAt: string
  events: AgentEventEnvelopeV1[]
  answers: TurnAnswer[]
  pendingQuestion?: PendingQuestion
  checkpoint?: Checkpoint
  failureCode?: string
}

export type TurnStoreErrorCode =
  | 'turn_not_found'
  | 'turn_expired'
  | 'turn_already_exists'
  | 'invalid_turn_transition'
  | 'invalid_event_cursor'
  | 'question_not_pending'
  | 'invalid_answer'

export class TurnStoreError extends Error {
  readonly code: TurnStoreErrorCode

  constructor(code: TurnStoreErrorCode) {
    super(code)
    this.name = 'TurnStoreError'
    this.code = code
  }
}

export interface CreateTurnInput {
  turnId: string
  actor: RuntimeActor
  request: StartTurnRequestV1
  capabilityId: CapabilityId
  createdAt?: string
  initialStatus?: TurnStatus
  initialEvent?: AppendEventInput
}

export interface AppendEventInput {
  type: AgentEventType
  payload: Record<string, unknown>
  idempotencyKey: string
  timestamp?: string
}

export interface RecordAnswerInput {
  questionId: string
  answer: string
  idempotencyKey: string
  answeredAt?: string
}

export interface CommitTurnInput {
  actor: RuntimeActor
  expectedStatuses: readonly TurnStatus[]
  nextStatus?: TurnStatus
  event?: AppendEventInput
  pendingQuestion?: PendingQuestion | null
  checkpoint?: Checkpoint | null
  failureCode?: string | null
}

export interface CommitTurnResult {
  record: TurnRecord
  event?: AgentEventEnvelopeV1
  duplicateEvent: boolean
}

export interface RecordAnswerResult {
  record: TurnRecord
  answer: TurnAnswer
  duplicate: boolean
}

interface TransitionOptions {
  pendingQuestion?: PendingQuestion
  checkpoint?: Checkpoint
}

interface TurnStoreOptions {
  now?: () => Date
  retentionMs?: number
  beforeRename?: (temporaryPath: string, targetPath: string) => void | Promise<void>
}

const SAFE_TURN_ID = /^turn-[A-Za-z0-9_-]+$/u
const TERMINAL_STATUSES = new Set<TurnStatus>(['completed', 'failed', 'cancelled'])
const ALLOWED_TRANSITIONS: Record<TurnStatus, ReadonlySet<TurnStatus>> = {
  queued: new Set(['running', 'failed', 'cancelled']),
  running: new Set(['waiting_user', 'completed', 'failed', 'retrying', 'cancelled']),
  waiting_user: new Set(['running', 'failed', 'cancelled']),
  retrying: new Set(['running', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function requiredText(value: string, code: TurnStoreErrorCode): string {
  const normalized = value.trim()
  if (!normalized) throw new TurnStoreError(code)
  return normalized
}

export class TurnStore {
  private readonly queues = new Map<string, Promise<void>>()
  private readonly listeners = new Map<
    string,
    Set<(event: AgentEventEnvelopeV1) => void>
  >()
  private readonly now: () => Date
  private readonly retentionMs: number
  private readonly beforeRename?: TurnStoreOptions['beforeRename']

  constructor(
    private readonly rootDir: string,
    options: TurnStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.retentionMs = options.retentionMs ?? Number.POSITIVE_INFINITY
    this.beforeRename = options.beforeRename
  }

  private filePath(turnId: string): string {
    return path.join(this.rootDir, `${turnId}.json`)
  }

  private async serialize<T>(turnId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(turnId) ?? Promise.resolve()
    const running = previous.catch(() => undefined).then(action)
    const tail = running.then(() => undefined, () => undefined)
    this.queues.set(turnId, tail)
    try {
      return await running
    } finally {
      if (this.queues.get(turnId) === tail) this.queues.delete(turnId)
    }
  }

  private async read(turnId: string, checkExpiry = true): Promise<TurnRecord> {
    if (!SAFE_TURN_ID.test(turnId)) throw new TurnStoreError('turn_not_found')
    let raw: string
    try {
      raw = await readFile(this.filePath(turnId), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new TurnStoreError('turn_not_found')
      }
      throw error
    }
    const record = JSON.parse(raw) as TurnRecord
    if (checkExpiry && this.now().getTime() - Date.parse(record.createdAt) > this.retentionMs) {
      throw new TurnStoreError('turn_expired')
    }
    return record
  }

  private async write(record: TurnRecord): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    const target = this.filePath(record.turnId)
    const temporary = `${target}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(record, null, 2))
    await this.beforeRename?.(temporary, target)
    await rename(temporary, target)
  }

  private eventFor(record: TurnRecord, input: AppendEventInput): AgentEventEnvelopeV1 {
    const lastSequence = record.events.length === 0
      ? 0
      : Number(record.events.at(-1)?.eventId)
    return createAgentEvent({
      turnId: record.turnId,
      sequence: lastSequence + 1,
      type: input.type,
      payload: clone(input.payload),
      timestamp: input.timestamp ?? this.now().toISOString(),
      idempotencyKey: requiredText(input.idempotencyKey, 'invalid_event_cursor'),
    })
  }

  private notify(turnId: string, event: AgentEventEnvelopeV1 | undefined): void {
    if (!event) return
    for (const listener of this.listeners.get(turnId) ?? []) {
      try {
        listener(clone(event))
      } catch {
        // A disconnected or faulty subscriber cannot affect persisted events.
      }
    }
  }

  private assertActor(record: TurnRecord, actor: RuntimeActor): void {
    if (
      record.actor.userId !== actor.userId ||
      record.actor.workspaceId !== actor.workspaceId
    ) {
      throw new TurnStoreError('turn_not_found')
    }
  }

  async createTurn(input: CreateTurnInput): Promise<TurnRecord> {
    return this.serialize(input.turnId, async () => {
      if (!SAFE_TURN_ID.test(input.turnId)) throw new TurnStoreError('turn_not_found')
      try {
        await this.read(input.turnId, false)
        throw new TurnStoreError('turn_already_exists')
      } catch (error) {
        if (!(error instanceof TurnStoreError) || error.code !== 'turn_not_found') throw error
      }
      const createdAt = input.createdAt ?? this.now().toISOString()
      const record: TurnRecord = {
        version: '1',
        turnId: input.turnId,
        actor: clone(input.actor),
        request: clone(input.request),
        capabilityId: input.capabilityId,
        status: input.initialStatus ?? 'queued',
        createdAt,
        updatedAt: createdAt,
        events: [],
        answers: [],
      }
      let initialEvent: AgentEventEnvelopeV1 | undefined
      if (input.initialEvent) {
        initialEvent = this.eventFor(record, input.initialEvent)
        record.events.push(initialEvent)
      }
      await this.write(record)
      this.notify(input.turnId, initialEvent)
      return clone(record)
    })
  }

  async commitTurn(turnId: string, input: CommitTurnInput): Promise<CommitTurnResult> {
    return this.serialize(turnId, async () => {
      const record = await this.read(turnId)
      this.assertActor(record, input.actor)
      const existing = input.event === undefined
        ? undefined
        : record.events.find((event) => event.idempotencyKey === input.event?.idempotencyKey)
      if (!input.expectedStatuses.includes(record.status)) {
        if (existing && input.nextStatus === record.status) {
          return { record: clone(record), event: clone(existing), duplicateEvent: true }
        }
        throw new TurnStoreError('invalid_turn_transition')
      }
      if (input.nextStatus !== undefined && input.nextStatus !== record.status &&
        !ALLOWED_TRANSITIONS[record.status].has(input.nextStatus)) {
        throw new TurnStoreError('invalid_turn_transition')
      }
      if (input.nextStatus === 'waiting_user' &&
        (input.pendingQuestion === undefined || input.pendingQuestion === null ||
          input.checkpoint === undefined || input.checkpoint === null)) {
        throw new TurnStoreError('invalid_turn_transition')
      }

      let event: AgentEventEnvelopeV1 | undefined
      if (input.event) {
        event = existing ?? this.eventFor(record, input.event)
        if (!existing) record.events.push(event)
      }
      if (input.nextStatus !== undefined) record.status = input.nextStatus
      if (input.pendingQuestion === null) delete record.pendingQuestion
      else if (input.pendingQuestion !== undefined) record.pendingQuestion = clone(input.pendingQuestion)
      if (input.checkpoint === null) delete record.checkpoint
      else if (input.checkpoint !== undefined) record.checkpoint = clone(input.checkpoint)
      if (input.failureCode === null) delete record.failureCode
      else if (input.failureCode !== undefined) {
        record.failureCode = requiredText(input.failureCode, 'invalid_turn_transition')
      }
      record.updatedAt = this.now().toISOString()

      const changed = !existing || input.nextStatus !== undefined ||
        input.pendingQuestion !== undefined || input.checkpoint !== undefined ||
        input.failureCode !== undefined
      if (changed) await this.write(record)
      if (!existing) this.notify(turnId, event)
      return {
        record: clone(record),
        ...(event ? { event: clone(event) } : {}),
        duplicateEvent: existing !== undefined,
      }
    })
  }

  async getTurn(turnId: string): Promise<TurnRecord> {
    await (this.queues.get(turnId) ?? Promise.resolve())
    return clone(await this.read(turnId))
  }

  async getTurnForActor(turnId: string, actor: RuntimeActor): Promise<TurnRecord> {
    const record = await this.getTurn(turnId)
    this.assertActor(record, actor)
    return record
  }

  async transition(
    turnId: string,
    nextStatus: TurnStatus,
    options: TransitionOptions = {},
  ): Promise<TurnRecord> {
    return this.serialize(turnId, async () => {
      const record = await this.read(turnId)
      if (!ALLOWED_TRANSITIONS[record.status].has(nextStatus)) {
        throw new TurnStoreError('invalid_turn_transition')
      }
      if (nextStatus === 'waiting_user' && (!options.pendingQuestion || !options.checkpoint)) {
        throw new TurnStoreError('invalid_turn_transition')
      }
      record.status = nextStatus
      record.updatedAt = this.now().toISOString()
      if (nextStatus === 'waiting_user') {
        record.pendingQuestion = clone(options.pendingQuestion as PendingQuestion)
        record.checkpoint = clone(options.checkpoint as Checkpoint)
      } else {
        delete record.pendingQuestion
      }
      await this.write(record)
      return clone(record)
    })
  }

  async failTurn(turnId: string, failureCode: string): Promise<TurnRecord> {
    return this.serialize(turnId, async () => {
      const record = await this.read(turnId)
      if (record.status === 'failed') return clone(record)
      if (TERMINAL_STATUSES.has(record.status)) {
        throw new TurnStoreError('invalid_turn_transition')
      }
      record.status = 'failed'
      record.failureCode = requiredText(failureCode, 'invalid_turn_transition')
      record.updatedAt = this.now().toISOString()
      delete record.pendingQuestion
      await this.write(record)
      return clone(record)
    })
  }

  async cancelTurn(turnId: string): Promise<TurnRecord> {
    return this.serialize(turnId, async () => {
      const record = await this.read(turnId)
      if (record.status === 'cancelled') return clone(record)
      if (record.status === 'completed' || record.status === 'failed') {
        throw new TurnStoreError('invalid_turn_transition')
      }
      record.status = 'cancelled'
      record.updatedAt = this.now().toISOString()
      delete record.pendingQuestion
      await this.write(record)
      return clone(record)
    })
  }

  async appendEvent(turnId: string, input: AppendEventInput): Promise<AgentEventEnvelopeV1> {
    return this.serialize(turnId, async () => {
      const record = await this.read(turnId)
      const key = requiredText(input.idempotencyKey, 'invalid_event_cursor')
      const existing = record.events.find((event) => event.idempotencyKey === key)
      if (existing) return clone(existing)
      const event = this.eventFor(record, { ...input, idempotencyKey: key })
      record.events.push(event)
      record.updatedAt = this.now().toISOString()
      await this.write(record)
      this.notify(turnId, event)
      return clone(event)
    })
  }

  subscribe(turnId: string, listener: (event: AgentEventEnvelopeV1) => void): () => void {
    const listeners = this.listeners.get(turnId) ?? new Set()
    listeners.add(listener)
    this.listeners.set(turnId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(turnId)
    }
  }

  async listEventsAfter(
    turnId: string,
    eventId?: string,
  ): Promise<AgentEventEnvelopeV1[]> {
    const record = await this.getTurn(turnId)
    if (eventId === undefined || eventId === '') return record.events
    if (!/^\d+$/u.test(eventId)) throw new TurnStoreError('invalid_event_cursor')
    const cursor = Number(eventId)
    const last = Number(record.events.at(-1)?.eventId ?? 0)
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > last) {
      throw new TurnStoreError('invalid_event_cursor')
    }
    return record.events.filter((event) => Number(event.eventId) > cursor)
  }

  async listEventsAfterForActor(
    turnId: string,
    actor: RuntimeActor,
    eventId?: string,
  ): Promise<AgentEventEnvelopeV1[]> {
    await this.getTurnForActor(turnId, actor)
    return this.listEventsAfter(turnId, eventId)
  }

  async recordAnswer(turnId: string, input: RecordAnswerInput): Promise<RecordAnswerResult> {
    return this.serialize(turnId, async () => {
      const record = await this.read(turnId)
      const idempotencyKey = requiredText(input.idempotencyKey, 'invalid_answer')
      const existing = record.answers.find((answer) => answer.idempotencyKey === idempotencyKey)
      if (existing) {
        if (existing.questionId !== input.questionId ||
          record.pendingQuestion?.questionId !== existing.questionId) {
          throw new TurnStoreError('invalid_answer')
        }
        return { record: clone(record), answer: clone(existing), duplicate: true }
      }
      if (record.status !== 'waiting_user' || record.pendingQuestion?.questionId !== input.questionId) {
        throw new TurnStoreError('question_not_pending')
      }
      const answer: TurnAnswer = {
        questionId: requiredText(input.questionId, 'invalid_answer'),
        answer: requiredText(input.answer, 'invalid_answer'),
        idempotencyKey,
        answeredAt: input.answeredAt ?? this.now().toISOString(),
      }
      record.answers.push(answer)
      record.updatedAt = this.now().toISOString()
      await this.write(record)
      return { record: clone(record), answer: clone(answer), duplicate: false }
    })
  }

  async resumeWithAnswer(
    turnId: string,
    actor: RuntimeActor,
    input: RecordAnswerInput,
  ): Promise<RecordAnswerResult> {
    return this.serialize(turnId, async () => {
      const record = await this.read(turnId)
      this.assertActor(record, actor)
      const idempotencyKey = requiredText(input.idempotencyKey, 'invalid_answer')
      const existing = record.answers.find((answer) => answer.idempotencyKey === idempotencyKey)
      if (existing) {
        if (existing.questionId !== input.questionId ||
          (record.status === 'waiting_user' &&
            record.pendingQuestion?.questionId !== existing.questionId)) {
          throw new TurnStoreError('invalid_answer')
        }
        return { record: clone(record), answer: clone(existing), duplicate: true }
      }
      if (record.status !== 'waiting_user' || record.pendingQuestion?.questionId !== input.questionId) {
        throw new TurnStoreError('question_not_pending')
      }
      const answer: TurnAnswer = {
        questionId: requiredText(input.questionId, 'invalid_answer'),
        answer: requiredText(input.answer, 'invalid_answer'),
        idempotencyKey,
        answeredAt: input.answeredAt ?? this.now().toISOString(),
      }
      record.answers.push(answer)
      record.status = 'running'
      delete record.pendingQuestion
      record.updatedAt = this.now().toISOString()
      await this.write(record)
      return { record: clone(record), answer: clone(answer), duplicate: false }
    })
  }
}

export function createTurnStore(rootDir: string, options: TurnStoreOptions = {}): TurnStore {
  return new TurnStore(rootDir, options)
}
