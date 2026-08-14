import {
  json,
  Router,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express'

import type { AgentEventEnvelopeV1 } from '../agent/runtime/agentEvent.js'
import type { AgentRuntime, RuntimeStartResult } from '../agent/runtime/agentRuntime.js'
import {
  AgentRuntimeValidationError,
  normalizeStartTurnRequest,
  type RuntimeActor,
} from '../agent/runtime/agentRuntimeTypes.js'
import {
  TurnStoreError,
  type RecordAnswerInput,
  type TurnRecord,
  type TurnStore,
} from '../agent/runtime/turnStore.js'

interface AgentTurnsRuntime {
  start(
    request: ReturnType<typeof normalizeStartTurnRequest>,
    actor: RuntimeActor,
  ): Promise<RuntimeStartResult>
  resume(turnId: string, actor: RuntimeActor, input: RecordAnswerInput): Promise<RuntimeStartResult>
  cancel(turnId: string, actor: RuntimeActor): Promise<TurnRecord>
}

interface AgentTurnsStore {
  getTurnForActor(turnId: string, actor: RuntimeActor): Promise<Pick<TurnRecord, 'status'>>
  listEventsAfterForActor(
    turnId: string,
    actor: RuntimeActor,
    eventId?: string,
  ): Promise<AgentEventEnvelopeV1[]>
  subscribe(turnId: string, listener: (event: AgentEventEnvelopeV1) => void): () => void
}

export interface AgentTurnsTimers {
  setInterval(callback: () => void, delay: number): unknown
  setTimeout(callback: () => void, delay: number): unknown
  clear(timer: unknown): void
}

interface AgentTurnsRouterDependencies {
  runtime: AgentRuntime | AgentTurnsRuntime
  turnStore: TurnStore | AgentTurnsStore
  actorProvider: (request: Request) => RuntimeActor | Promise<RuntimeActor>
  timers?: AgentTurnsTimers
  heartbeatMs?: number
  subscriptionMaxMs?: number
}

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  unsupported_version: '请求无效。',
  message_required: '请求无效。',
  message_too_long: '请求无效。',
  invalid_surface: '请求无效。',
  invalid_refs: '请求无效。',
  invalid_capability: '请求无效。',
  invalid_request: '请求无效。',
  invalid_json: '请求无效。',
  invalid_answer: '回答无效。',
  question_not_pending: '当前没有待回答的问题。',
  invalid_turn_transition: '当前轮次状态不允许此操作。',
  invalid_event_cursor: '事件游标无效。',
  turn_not_found: '轮次不存在。',
  turn_expired: '轮次已过期。',
}

function defaultTimers(): AgentTurnsTimers {
  return {
    setInterval: (callback, delay) => setInterval(callback, delay),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clear(timer) {
      clearInterval(timer as NodeJS.Timeout)
      clearTimeout(timer as NodeJS.Timeout)
    },
  }
}

function writeError(res: Response, status: number, code: string): void {
  res.status(status).json({
    error: {
      version: '1',
      code,
      message: SAFE_ERROR_MESSAGES[code] ?? '请求处理失败。',
    },
  })
}

function statusFor(error: unknown): number {
  if (error instanceof AgentRuntimeValidationError) return 400
  if (error instanceof TurnStoreError) {
    if (error.code === 'turn_not_found') return 404
    if (error.code === 'turn_expired') return 410
    if (error.code === 'question_not_pending' || error.code === 'invalid_turn_transition') return 409
    return 400
  }
  return 500
}

function codeFor(error: unknown): string {
  if (error instanceof AgentRuntimeValidationError || error instanceof TurnStoreError) {
    return error.code
  }
  return 'internal_error'
}

function openSse(res: Response): void {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

function writeSseEvent(res: Response, event: AgentEventEnvelopeV1): void {
  if (res.destroyed || res.writableEnded) return
  res.write(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
}

function isSettledStatus(status: TurnRecord['status']): boolean {
  return status === 'waiting_user' || status === 'completed' ||
    status === 'failed' || status === 'cancelled'
}

function isSettlingEvent(event: AgentEventEnvelopeV1): boolean {
  return event.type === 'user_question' || event.type === 'turn_completed' ||
    event.type === 'turn_failed'
}

async function streamTurn(
  req: Request,
  res: Response,
  turnId: string,
  actor: RuntimeActor,
  store: AgentTurnsStore,
  afterEventId: string | undefined,
  timers: AgentTurnsTimers,
  heartbeatMs: number,
  subscriptionMaxMs: number,
  completion?: Promise<void>,
): Promise<void> {
  const initialReplay = await store.listEventsAfterForActor(turnId, actor, afterEventId ?? '0')
  await store.getTurnForActor(turnId, actor)
  openSse(res)
  let lastEventId = afterEventId ?? '0'
  let finished = false
  let resolveFinished: (() => void) | undefined
  const finishedPromise = new Promise<void>((resolve) => { resolveFinished = resolve })
  let heartbeatTimer: unknown
  let limitTimer: unknown
  let unsubscribe: () => void = () => undefined
  let replaying = true
  const bufferedEvents: AgentEventEnvelopeV1[] = []

  const cleanup = () => {
    unsubscribe()
    if (heartbeatTimer !== undefined) timers.clear(heartbeatTimer)
    if (limitTimer !== undefined) timers.clear(limitTimer)
    req.removeListener('aborted', onDisconnect)
    res.removeListener('close', onDisconnect)
  }
  const finish = () => {
    if (finished) return
    finished = true
    cleanup()
    if (!res.destroyed && !res.writableEnded) res.end()
    resolveFinished?.()
  }
  const onDisconnect = () => finish()
  const send = (event: AgentEventEnvelopeV1) => {
    if (finished || Number(event.eventId) <= Number(lastEventId)) return
    writeSseEvent(res, event)
    lastEventId = event.eventId
    if (isSettlingEvent(event)) finish()
  }

  unsubscribe = store.subscribe(turnId, (event) => {
    if (replaying) bufferedEvents.push(event)
    else send(event)
  })
  req.once('aborted', onDisconnect)
  res.once('close', onDisconnect)
  heartbeatTimer = timers.setInterval(() => {
    if (!finished && !res.destroyed && !res.writableEnded) res.write(': heartbeat\n\n')
  }, heartbeatMs)
  limitTimer = timers.setTimeout(finish, subscriptionMaxMs)

  try {
    for (const event of initialReplay) {
      send(event)
      if (finished) break
    }
    if (!finished) {
      const catchUp = await store.listEventsAfterForActor(turnId, actor, lastEventId)
      for (const event of catchUp) {
        send(event)
        if (finished) break
      }
    }
    replaying = false
    if (!finished) {
      bufferedEvents.sort((left, right) => Number(left.eventId) - Number(right.eventId))
      for (const event of bufferedEvents) {
        send(event)
        if (finished) break
      }
    }
    if (!finished) {
      const record = await store.getTurnForActor(turnId, actor)
      if (isSettledStatus(record.status)) finish()
    }
    if (!finished && completion) {
      await completion
      const remaining = await store.listEventsAfterForActor(turnId, actor, lastEventId)
      for (const event of remaining) {
        send(event)
        if (finished) break
      }
      if (!finished) finish()
    }
    if (!finished) await finishedPromise
  } catch (error) {
    finish()
    throw error
  }
}

function normalizeAnswer(value: unknown, turnId: string): RecordAnswerInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TurnStoreError('invalid_answer')
  }
  const record = value as Record<string, unknown>
  if (typeof record.questionId !== 'string' || !record.questionId.trim()) {
    throw new TurnStoreError('invalid_answer')
  }
  if (typeof record.answer !== 'string' || !record.answer.trim()) {
    throw new TurnStoreError('invalid_answer')
  }
  if (record.idempotencyKey !== undefined &&
    (typeof record.idempotencyKey !== 'string' || !record.idempotencyKey.trim())) {
    throw new TurnStoreError('invalid_answer')
  }
  return {
    questionId: record.questionId.trim(),
    answer: record.answer.trim(),
    idempotencyKey: typeof record.idempotencyKey === 'string'
      ? record.idempotencyKey.trim()
      : `${turnId}:answer:${record.questionId.trim()}`,
  }
}

export function createAgentTurnsRouter(dependencies: AgentTurnsRouterDependencies): Router {
  const router = Router()
  const runtime: AgentTurnsRuntime = dependencies.runtime
  const store: AgentTurnsStore = dependencies.turnStore
  const timers = dependencies.timers ?? defaultTimers()
  const heartbeatMs = dependencies.heartbeatMs ?? 15_000
  const subscriptionMaxMs = dependencies.subscriptionMaxMs ?? 120_000
  router.use(json({ limit: '1mb' }))

  router.post('/turns', async (req, res) => {
    try {
      const normalized = normalizeStartTurnRequest(req.body)
      const actor = await dependencies.actorProvider(req)
      const started = await runtime.start(normalized, actor)
      await streamTurn(
        req, res, started.turnId, actor, store, '0', timers,
        heartbeatMs, subscriptionMaxMs, started.completion,
      )
    } catch (error) {
      if (!res.headersSent) writeError(res, statusFor(error), codeFor(error))
    }
  })

  router.get('/turns/:turnId/events', async (req, res) => {
    try {
      const header = req.get('Last-Event-ID')
      const query = typeof req.query.afterEventId === 'string'
        ? req.query.afterEventId
        : undefined
      const actor = await dependencies.actorProvider(req)
      await streamTurn(
        req, res, req.params.turnId, actor, store, header ?? query ?? '0', timers,
        heartbeatMs, subscriptionMaxMs,
      )
    } catch (error) {
      if (!res.headersSent) writeError(res, statusFor(error), codeFor(error))
    }
  })

  router.post('/turns/:turnId/answers', async (req, res) => {
    try {
      const actor = await dependencies.actorProvider(req)
      const prior = await store.listEventsAfterForActor(req.params.turnId, actor)
      const cursor = prior.at(-1)?.eventId ?? '0'
      const resumed = await runtime.resume(
        req.params.turnId,
        actor,
        normalizeAnswer(req.body, req.params.turnId),
      )
      await streamTurn(
        req, res, req.params.turnId, actor, store, cursor, timers,
        heartbeatMs, subscriptionMaxMs, resumed.completion,
      )
    } catch (error) {
      if (!res.headersSent) writeError(res, statusFor(error), codeFor(error))
    }
  })

  router.post('/turns/:turnId/cancel', async (req, res) => {
    try {
      const actor = await dependencies.actorProvider(req)
      const record = await runtime.cancel(req.params.turnId, actor)
      res.json({ version: '1', turnId: record.turnId, status: 'cancelled' })
    } catch (error) {
      writeError(res, statusFor(error), codeFor(error))
    }
  })

  const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    const candidate = error as SyntaxError & { status?: unknown; type?: unknown }
    if (
      error instanceof SyntaxError && candidate.status === 400 &&
      candidate.type === 'entity.parse.failed'
    ) {
      writeError(res, 400, 'invalid_json')
      return
    }
    next(error)
  }
  router.use(jsonErrorHandler)

  return router
}
