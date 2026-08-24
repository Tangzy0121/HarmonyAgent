import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { StartTurnRequestV1 } from './agentRuntimeTypes.js'
import {
  createTurnStore,
  TurnStoreError,
  type Checkpoint,
  type PendingQuestion,
} from './turnStore.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), 'turn-store-'))
  roots.push(value)
  return value
}

const request: StartTurnRequestV1 = {
  version: '1',
  message: '解释标签',
  surface: 'learning',
  refs: { bookId: 'book_one', chapterId: 'chapter-1' },
  capabilityHint: 'guided_learning',
}

const question: PendingQuestion = {
  questionId: 'question-1',
  prompt: '你想学习哪一节？',
  options: ['第一节', '第二节'],
  allowFreeText: true,
  askedAt: '2026-08-14T00:00:02.000Z',
}

const checkpoint: Checkpoint = {
  capabilityId: 'guided_learning',
  refs: { bookId: 'book_one', chapterId: 'chapter-1' },
  confirmedOutput: '已确认章节范围。',
  completedSteps: ['ground_context'],
}

async function createQueued(store: ReturnType<typeof createTurnStore>, turnId = 'turn-1') {
  return store.createTurn({
    turnId,
    actor: { userId: 'server-user', workspaceId: 'server-workspace' },
    request,
    capabilityId: 'guided_learning',
    createdAt: '2026-08-14T00:00:00.000Z',
  })
}

describe('TurnStore state machine and persistence', () => {
  it('persists the queued → running → waiting_user → running → completed lifecycle', async () => {
    const directory = await root()
    const store = createTurnStore(directory)
    expect((await createQueued(store)).status).toBe('queued')
    expect((await store.transition('turn-1', 'running')).status).toBe('running')
    const waiting = await store.transition('turn-1', 'waiting_user', {
      pendingQuestion: question,
      checkpoint,
    })
    expect(waiting).toMatchObject({ status: 'waiting_user', pendingQuestion: question, checkpoint })
    expect((await store.transition('turn-1', 'running')).status).toBe('running')
    const completed = await store.transition('turn-1', 'completed')
    expect(completed.status).toBe('completed')
    expect(completed.pendingQuestion).toBeUndefined()

    const files = await readdir(directory)
    expect(files).toEqual(['turn-1.json'])
    await expect(readFile(path.join(directory, 'turn-1.json'), 'utf8'))
      .resolves.toSatisfy((raw: string) => JSON.parse(raw).status === 'completed')
  })

  it('supports fail and idempotent cancel while rejecting illegal transitions', async () => {
    const directory = await root()
    const store = createTurnStore(directory)
    await createQueued(store, 'turn-fail')
    await store.transition('turn-fail', 'running')
    expect((await store.failTurn('turn-fail', 'upstream_unavailable')).status).toBe('failed')
    await expect(store.transition('turn-fail', 'running'))
      .rejects.toMatchObject({ code: 'invalid_turn_transition' })

    await createQueued(store, 'turn-cancel')
    const first = await store.cancelTurn('turn-cancel')
    const repeated = await store.cancelTurn('turn-cancel')
    expect(first.status).toBe('cancelled')
    expect(repeated).toEqual(first)
  })

  it('serializes concurrent appends, assigns monotonic IDs and de-duplicates idempotency keys', async () => {
    const directory = await root()
    const store = createTurnStore(directory)
    await createQueued(store)

    const [one, two, duplicate] = await Promise.all([
      store.appendEvent('turn-1', {
        type: 'activity',
        payload: { label: 'one' },
        idempotencyKey: 'activity-one',
      }),
      store.appendEvent('turn-1', {
        type: 'content_delta',
        payload: { text: '二' },
        idempotencyKey: 'delta-two',
      }),
      store.appendEvent('turn-1', {
        type: 'activity',
        payload: { label: 'must-not-overwrite' },
        idempotencyKey: 'activity-one',
      }),
    ])

    expect(one.eventId).toBe('1')
    expect(two.eventId).toBe('2')
    expect(duplicate).toEqual(one)
    expect(await store.listEventsAfter('turn-1')).toEqual([one, two])
    expect(await store.listEventsAfter('turn-1', '1')).toEqual([two])
    expect(await store.listEventsAfter('turn-1', '2')).toEqual([])
  })

  it('restores waiting questions, checkpoints and answers after a new store instance starts', async () => {
    const directory = await root()
    const first = createTurnStore(directory)
    await createQueued(first)
    await first.transition('turn-1', 'running')
    await first.transition('turn-1', 'waiting_user', { pendingQuestion: question, checkpoint })
    const recorded = await first.recordAnswer('turn-1', {
      questionId: 'question-1',
      answer: '第一节',
      idempotencyKey: 'answer-question-1',
    })
    const duplicate = await first.recordAnswer('turn-1', {
      questionId: 'question-1',
      answer: '不同内容不得覆盖',
      idempotencyKey: 'answer-question-1',
    })
    expect(recorded.duplicate).toBe(false)
    expect(duplicate).toMatchObject({ duplicate: true, answer: recorded.answer })

    const restored = await createTurnStore(directory).getTurn('turn-1')
    expect(restored).toMatchObject({
      status: 'waiting_user',
      pendingQuestion: question,
      checkpoint,
      answers: [recorded.answer],
    })
  })

  it('atomically resumes with duplicate metadata and rejects a stale key for a later question', async () => {
    const directory = await root()
    const store = createTurnStore(directory)
    const actor = { userId: 'server-user', workspaceId: 'server-workspace' }
    await createQueued(store)
    await store.transition('turn-1', 'running')
    await store.transition('turn-1', 'waiting_user', { pendingQuestion: question, checkpoint })

    const first = await store.resumeWithAnswer('turn-1', actor, {
      questionId: question.questionId,
      answer: '第一节',
      idempotencyKey: 'answer-shared',
    })
    const duplicate = await store.resumeWithAnswer('turn-1', actor, {
      questionId: question.questionId,
      answer: '不得覆盖',
      idempotencyKey: 'answer-shared',
    })
    expect(first.duplicate).toBe(false)
    expect(first.record.status).toBe('running')
    expect(duplicate).toMatchObject({ duplicate: true, answer: first.answer })

    const secondQuestion = { ...question, questionId: 'question-2' }
    await store.commitTurn('turn-1', {
      actor,
      expectedStatuses: ['running'],
      nextStatus: 'waiting_user',
      event: {
        type: 'user_question', payload: { questionId: 'question-2' },
        idempotencyKey: 'question-2',
      },
      pendingQuestion: secondQuestion,
      checkpoint,
    })
    await expect(store.resumeWithAnswer('turn-1', actor, {
      questionId: question.questionId,
      answer: '第一节',
      idempotencyKey: 'answer-shared',
    })).rejects.toMatchObject({ code: 'invalid_answer' })
    await expect(store.recordAnswer('turn-1', {
      questionId: question.questionId,
      answer: '第一节',
      idempotencyKey: 'answer-shared',
    })).rejects.toMatchObject({ code: 'invalid_answer' })
    expect(await store.getTurn('turn-1')).toMatchObject({
      status: 'waiting_user', pendingQuestion: secondQuestion,
    })
  })

  it('returns stable errors for unknown and expired turns without echoing identifiers', async () => {
    const directory = await root()
    const now = { value: Date.parse('2026-08-14T00:00:00.000Z') }
    const store = createTurnStore(directory, {
      now: () => new Date(now.value),
      retentionMs: 1_000,
    })
    await createQueued(store)
    now.value += 2_000

    await expect(store.getTurn('turn-1')).rejects.toMatchObject<Partial<TurnStoreError>>({
      code: 'turn_expired',
      message: 'turn_expired',
    })
    await expect(store.getTurn('turn-private-user-content'))
      .rejects.toMatchObject({ code: 'turn_not_found', message: 'turn_not_found' })
  })

  it('atomically commits an event and status/checkpoint or leaves the prior record intact', async () => {
    const directory = await root()
    let failRename = false
    const store = createTurnStore(directory, {
      beforeRename: async () => {
        if (failRename) throw new Error('injected_write_failure')
      },
    })
    await store.createTurn({
      turnId: 'turn-atomic',
      actor: { userId: 'server-user', workspaceId: 'server-workspace' },
      request,
      capabilityId: 'guided_learning',
      initialStatus: 'running',
      initialEvent: {
        type: 'turn_started', payload: { capability: 'guided_learning' },
        idempotencyKey: 'turn-atomic:started',
      },
    })
    failRename = true

    await expect(store.commitTurn('turn-atomic', {
      actor: { userId: 'server-user', workspaceId: 'server-workspace' },
      expectedStatuses: ['running'],
      nextStatus: 'waiting_user',
      event: {
        type: 'user_question',
        payload: {
          questionId: question.questionId,
          prompt: question.prompt,
          options: question.options,
          allowFreeText: question.allowFreeText,
        },
        idempotencyKey: 'turn-atomic:question',
      },
      pendingQuestion: question,
      checkpoint,
    })).rejects.toThrowError('injected_write_failure')

    const restored = await createTurnStore(directory).getTurn('turn-atomic')
    expect(restored.status).toBe('running')
    expect(restored.pendingQuestion).toBeUndefined()
    expect(restored.checkpoint).toBeUndefined()
    expect(restored.events.map((event) => event.type)).toEqual(['turn_started'])
  })

  it('enforces the state machine inside domain commits', async () => {
    const directory = await root()
    const store = createTurnStore(directory)
    const actor = { userId: 'server-user', workspaceId: 'server-workspace' }
    await store.createTurn({
      turnId: 'turn-domain', actor, request, capabilityId: 'guided_learning',
      initialStatus: 'running',
    })

    await expect(store.commitTurn('turn-domain', {
      actor, expectedStatuses: ['running'], nextStatus: 'queued',
      event: { type: 'activity', payload: {}, idempotencyKey: 'invalid-rewind' },
    })).rejects.toMatchObject({ code: 'invalid_turn_transition' })
    expect(await store.getTurn('turn-domain')).toMatchObject({
      status: 'running', events: [],
    })
  })

  it.each([
    ['cancel-first', 'cancelled', 'turn_failed'],
    ['terminal-first', 'completed', 'turn_completed'],
  ] as const)('serializes %s races without mismatched terminal events and state', async (
    order,
    expectedStatus,
    expectedEvent,
  ) => {
    const directory = await root()
    const store = createTurnStore(directory)
    await store.createTurn({
      turnId: 'turn-race',
      actor: { userId: 'server-user', workspaceId: 'server-workspace' },
      request,
      capabilityId: 'guided_learning',
      initialStatus: 'running',
      initialEvent: {
        type: 'turn_started', payload: {}, idempotencyKey: 'turn-race:started',
      },
    })
    const actor = { userId: 'server-user', workspaceId: 'server-workspace' }
    const cancel = () => store.commitTurn('turn-race', {
      actor,
      expectedStatuses: ['running', 'cancelled'],
      nextStatus: 'cancelled',
      event: {
        type: 'turn_failed', payload: { code: 'cancelled' },
        idempotencyKey: 'turn-race:cancelled',
      },
    })
    const complete = () => store.commitTurn('turn-race', {
      actor,
      expectedStatuses: ['running'],
      nextStatus: 'completed',
      event: {
        type: 'turn_completed', payload: { status: 'completed' },
        idempotencyKey: 'turn-race:completed',
      },
    })

    const results = order === 'cancel-first'
      ? await Promise.allSettled([cancel(), complete()])
      : await Promise.allSettled([complete(), cancel()])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)

    const record = await store.getTurn('turn-race')
    expect(record.status).toBe(expectedStatus)
    expect(record.events.at(-1)?.type).toBe(expectedEvent)
    expect(record.events.some((event) =>
      event.type === (expectedEvent === 'turn_completed' ? 'turn_failed' : 'turn_completed')))
      .toBe(false)
  })
})
