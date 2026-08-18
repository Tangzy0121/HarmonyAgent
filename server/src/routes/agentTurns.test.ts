import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBookStore } from '../books/bookStore.js'
import type { StoredBook } from '../books/bookTypes.js'
import { AgentRuntime } from '../agent/runtime/agentRuntime.js'
import type { BookAgentRunner } from '../agent/runtime/bookAgentRunner.js'
import { createSingleUserBookAccess, LearningContextBuilder } from '../agent/runtime/learningContext.js'
import { createTurnStore } from '../agent/runtime/turnStore.js'
import { createAgentTurnsRouter } from './agentTurns.js'

const roots: string[] = []
const actor = { userId: 'server-user', workspaceId: 'server-workspace' }
const otherActor = { userId: 'other-user', workspaceId: 'other-workspace' }
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function book(): StoredBook {
  const now = '2026-08-14T00:00:00.000Z'
  return {
    id: 'book_one',
    source: {
      id: 'document-1', fileName: 'lecture.pdf', format: 'PDF', pageCount: 8,
      sizeLabel: '1 MB', updatedLabel: '今天',
    },
    goal: '理解概念',
    learnerLevel: '入门',
    proposal: {
      title: '机器学习入门', description: 'desc', rationale: 'why', estimatedMinutes: 20,
    },
    status: 'ready',
    chapters: [{
      id: 'chapter-1', title: '监督学习', order: 1, objective: '理解标签',
      coreConceptId: 'concept-label', estimatedMinutes: 10, sourceAnchors: [], status: 'ready',
      blocks: [{
        id: 'block-1', type: 'explanation', status: 'ready', title: '标签', revision: 1,
        sourceAnchors: [{
          sourceId: 'source-1', fileName: 'lecture.pdf', pageRange: '4-5',
          excerpt: '训练数据包含输入和对应标签。',
        }],
        body: '标签提供学习目标。', keyPoint: '标签',
      }],
    }],
    activeChapterId: 'chapter-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    reviewSchedule: {},
    createdAt: now,
    updatedAt: now,
    generationJobs: [],
  }
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-turn-routes-'))
  roots.push(root)
  const bookStore = createBookStore(path.join(root, 'books'))
  await bookStore.save(book())
  const turnStore = createTurnStore(path.join(root, 'turns'))
  let turnCounter = 0
  let runCount = 0
  const runner: BookAgentRunner = {
    isConfigured: () => true,
    reportInternalError: () => undefined,
    async run(_request, callbacks) {
      runCount += 1
      await callbacks.onDelta('标签提供学习目标。[S1]')
      return {}
    },
  }
  const runtime = new AgentRuntime({
    turnStore,
    contextBuilder: new LearningContextBuilder({ bookAccess: createSingleUserBookAccess(bookStore, actor) }),
    runner,
    createTurnId: () => `turn-${++turnCounter}`,
  })
  const app = express()
  app.use('/api/agent', createAgentTurnsRouter({
    runtime,
    turnStore,
    actorProvider: (req) => req.get('X-Test-Actor') === 'other' ? otherActor : actor,
  }))
  return { app, runtime, turnStore, getRunCount: () => runCount }
}

function eventsFrom(text: string) {
  return text.split('\n\n').filter((frame) => frame.startsWith('id: ')).map((frame) => {
    const lines = frame.split('\n')
    return {
      id: lines.find((line) => line.startsWith('id: '))?.slice(4),
      event: lines.find((line) => line.startsWith('event: '))?.slice(7),
      data: JSON.parse(lines.find((line) => line.startsWith('data: '))?.slice(6) ?? 'null'),
    }
  })
}

function startBody(capabilityHint: 'free_chat' | 'guided_learning', withChapter = true) {
  return {
    version: '1',
    message: '解释标签',
    surface: 'learning',
    refs: {
      bookId: 'book_one',
      ...(withChapter ? { chapterId: 'chapter-1', blockId: 'block-1' } : {}),
    },
    capabilityHint,
    userId: 'client-attacker',
    workspaceId: 'client-workspace',
  }
}

describe('V1 agent turn routes', () => {
  it('POST /turns emits ordered V1 SSE envelopes and uses only the server actor', async () => {
    const { app, turnStore } = await setup()

    const response = await request(app).post('/api/agent/turns').send(startBody('free_chat'))

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    const events = eventsFrom(response.text)
    expect(events.map((event) => event.event)).toEqual([
      'turn_started', 'activity', 'content_delta', 'citation', 'turn_completed',
    ])
    expect(events.map((event) => event.id)).toEqual(['1', '2', '3', '4', '5'])
    for (const event of events) {
      expect(event.data).toMatchObject({
        version: '1', turnId: 'turn-1', eventId: event.id, type: event.event,
      })
    }
    expect((await turnStore.getTurn('turn-1')).actor).toEqual({
      userId: 'server-user', workspaceId: 'server-workspace',
    })
  })

  it('returns safe versioned JSON errors without echoing user input', async () => {
    const { app } = await setup()
    const privateMessage = 'private-user-content-secret'

    const response = await request(app).post('/api/agent/turns').send({
      version: '9', message: privateMessage, surface: 'learning', refs: {},
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: { version: '1', code: 'unsupported_version', message: '请求无效。' },
    })
    expect(response.text).not.toContain(privateMessage)
  })

  it('wraps unknown-turn and invalid-cursor replay errors before opening SSE', async () => {
    const { app } = await setup()

    const missing = await request(app).get('/api/agent/turns/turn-missing/events')
    await request(app).post('/api/agent/turns').send(startBody('free_chat'))
    const invalidCursor = await request(app)
      .get('/api/agent/turns/turn-1/events')
      .set('Last-Event-ID', '999')

    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({
      error: { version: '1', code: 'turn_not_found', message: '轮次不存在。' },
    })
    expect(invalidCursor.status).toBe(400)
    expect(invalidCursor.body).toEqual({
      error: { version: '1', code: 'invalid_event_cursor', message: '事件游标无效。' },
    })
  })

  it('hides owned turns and books from a different server actor on every endpoint', async () => {
    const { app } = await setup()
    await request(app).post('/api/agent/turns').send(startBody('guided_learning', false))

    const deniedReplay = await request(app)
      .get('/api/agent/turns/turn-1/events')
      .set('X-Test-Actor', 'other')
    const deniedAnswer = await request(app)
      .post('/api/agent/turns/turn-1/answers')
      .set('X-Test-Actor', 'other')
      .send({ questionId: 'turn-1:chapter', answer: 'chapter-1' })
    const deniedCancel = await request(app)
      .post('/api/agent/turns/turn-1/cancel')
      .set('X-Test-Actor', 'other')
      .send({})
    const deniedBook = await request(app)
      .post('/api/agent/turns')
      .set('X-Test-Actor', 'other')
      .send(startBody('guided_learning'))

    const hidden = {
      error: { version: '1', code: 'turn_not_found', message: '轮次不存在。' },
    }
    expect(deniedReplay.status).toBe(404)
    expect(deniedReplay.body).toEqual(hidden)
    expect(deniedAnswer.status).toBe(404)
    expect(deniedAnswer.body).toEqual(hidden)
    expect(deniedCancel.status).toBe(404)
    expect(deniedCancel.body).toEqual(hidden)
    expect(deniedBook.status).toBe(200)
    const bookEvents = eventsFrom(deniedBook.text)
    expect(bookEvents.at(-1)?.data.payload).toEqual({
      code: 'agent_failed', message: '学习助手生成失败，请稍后重试。',
    })
    expect(deniedBook.text).not.toContain('book_one')
    expect(deniedBook.text).not.toContain('机器学习入门')
  })

  it('answers a waiting turn once and a duplicate answer does not rerun side effects', async () => {
    const { app, getRunCount } = await setup()
    const waitingResponse = await request(app)
      .post('/api/agent/turns')
      .send(startBody('guided_learning', false))
    expect(eventsFrom(waitingResponse.text).at(-1)?.event).toBe('user_question')

    const body = {
      questionId: 'turn-1:chapter', answer: 'chapter-1', idempotencyKey: 'answer-1',
    }
    const resumed = await request(app).post('/api/agent/turns/turn-1/answers').send(body)
    const repeated = await request(app).post('/api/agent/turns/turn-1/answers').send({
      ...body, answer: 'must-not-overwrite',
    })

    expect(eventsFrom(resumed.text).map((event) => event.event)).toEqual([
      'activity', 'content_delta', 'citation', 'turn_completed',
    ])
    expect(eventsFrom(repeated.text)).toEqual([])
    expect(getRunCount()).toBe(1)
  })

  it('coalesces concurrent duplicate answers onto one resumed execution', async () => {
    const { app, getRunCount } = await setup()
    await request(app).post('/api/agent/turns').send(startBody('guided_learning', false))
    const body = {
      questionId: 'turn-1:chapter', answer: 'chapter-1', idempotencyKey: 'answer-1',
    }

    const [first, second] = await Promise.all([
      request(app).post('/api/agent/turns/turn-1/answers').send(body),
      request(app).post('/api/agent/turns/turn-1/answers').send(body),
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(getRunCount()).toBe(1)
  })

  it('GET /events replays only events after Last-Event-ID, with header taking precedence', async () => {
    const { app } = await setup()
    await request(app).post('/api/agent/turns').send(startBody('free_chat'))

    const response = await request(app)
      .get('/api/agent/turns/turn-1/events?afterEventId=1')
      .set('Last-Event-ID', '3')

    expect(eventsFrom(response.text).map((event) => event.id)).toEqual(['4', '5'])
  })

  it('POST /cancel is idempotent and preserves the persisted turn and its prior events', async () => {
    const { app, turnStore } = await setup()
    await request(app).post('/api/agent/turns').send(startBody('guided_learning', false))
    const before = await turnStore.listEventsAfter('turn-1')

    const first = await request(app).post('/api/agent/turns/turn-1/cancel').send({})
    const repeated = await request(app).post('/api/agent/turns/turn-1/cancel').send({})

    expect(first.body).toEqual({ version: '1', turnId: 'turn-1', status: 'cancelled' })
    expect(repeated.body).toEqual(first.body)
    expect((await turnStore.getTurn('turn-1')).status).toBe('cancelled')
    const after = await turnStore.listEventsAfter('turn-1')
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after.filter((event) => event.payload.code === 'cancelled')).toHaveLength(1)
  })

  it('closes the replay-subscribe-catch-up window without losing or duplicating a live event', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-turn-catchup-'))
    roots.push(root)
    const turnStore = createTurnStore(path.join(root, 'turns'))
    await turnStore.createTurn({
      turnId: 'turn-window', actor, request: startBody('free_chat'),
      capabilityId: 'free_chat', initialStatus: 'running',
      initialEvent: {
        type: 'turn_started', payload: {}, idempotencyKey: 'turn-window:started',
      },
    })
    let reachCatchUp: (() => void) | undefined
    const catchUpReached = new Promise<void>((resolve) => { reachCatchUp = resolve })
    let releaseCatchUp: (() => void) | undefined
    const catchUpBarrier = new Promise<void>((resolve) => { releaseCatchUp = resolve })
    let listCalls = 0
    let activeSubscriptions = 0
    const routeStore = {
      getTurnForActor: turnStore.getTurnForActor.bind(turnStore),
      async listEventsAfterForActor(turnId: string, owner: typeof actor, cursor?: string) {
        listCalls += 1
        if (listCalls === 2) {
          reachCatchUp?.()
          await catchUpBarrier
        }
        return turnStore.listEventsAfterForActor(turnId, owner, cursor)
      },
      subscribe(turnId: string, listener: Parameters<typeof turnStore.subscribe>[1]) {
        activeSubscriptions += 1
        const unsubscribe = turnStore.subscribe(turnId, listener)
        let active = true
        return () => {
          if (!active) return
          active = false
          activeSubscriptions -= 1
          unsubscribe()
        }
      },
    }
    const app = express()
    app.use('/api/agent', createAgentTurnsRouter({
      runtime: {} as AgentRuntime,
      turnStore: routeStore as never,
      actorProvider: () => actor,
    }))

    const responsePromise = request(app)
      .get('/api/agent/turns/turn-window/events')
      .then((response) => response)
    await catchUpReached
    await turnStore.commitTurn('turn-window', {
      actor, expectedStatuses: ['running'], nextStatus: 'completed',
      event: {
        type: 'turn_completed', payload: { status: 'completed' },
        idempotencyKey: 'turn-window:completed',
      },
    })
    releaseCatchUp?.()
    const response = await responsePromise

    expect(eventsFrom(response.text).map((event) => event.id)).toEqual(['1', '2'])
    expect(eventsFrom(response.text).filter((event) => event.id === '2')).toHaveLength(1)
    expect(activeSubscriptions).toBe(0)
  })

  it('releases a real aborted HTTP subscription and replays the retained turn without rerunning', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-turn-socket-'))
    roots.push(root)
    const bookStore = createBookStore(path.join(root, 'books'))
    await bookStore.save(book())
    const turnStore = createTurnStore(path.join(root, 'turns'))
    let runCount = 0
    let firstDeltaPersisted: (() => void) | undefined
    const firstDelta = new Promise<void>((resolve) => { firstDeltaPersisted = resolve })
    let releaseRunner: (() => void) | undefined
    const runnerBarrier = new Promise<void>((resolve) => { releaseRunner = resolve })
    const runtime = new AgentRuntime({
      turnStore,
      contextBuilder: new LearningContextBuilder({
        bookAccess: createSingleUserBookAccess(bookStore, actor),
      }),
      runner: {
        isConfigured: () => true,
        reportInternalError: () => undefined,
        async run(_request, callbacks) {
          runCount += 1
          await callbacks.onDelta('first-delta')
          firstDeltaPersisted?.()
          await runnerBarrier
          await callbacks.onDelta('second-delta')
          return {}
        },
      },
      createTurnId: () => 'turn-socket',
    })
    let activeSubscriptions = 0
    let signalRouteUnsubscribed: (() => void) | undefined
    const routeUnsubscribed = new Promise<void>((resolve) => {
      signalRouteUnsubscribed = resolve
    })
    const routeStore = {
      getTurnForActor: turnStore.getTurnForActor.bind(turnStore),
      listEventsAfterForActor: turnStore.listEventsAfterForActor.bind(turnStore),
      subscribe(turnId: string, listener: Parameters<typeof turnStore.subscribe>[1]) {
        activeSubscriptions += 1
        const unsubscribe = turnStore.subscribe(turnId, listener)
        let active = true
        return () => {
          if (!active) return
          active = false
          activeSubscriptions -= 1
          unsubscribe()
          if (activeSubscriptions === 0) signalRouteUnsubscribed?.()
        }
      },
    }
    const app = express()
    app.use('/api/agent', createAgentTurnsRouter({
      runtime, turnStore: routeStore as never, actorProvider: () => actor,
    }))
    const server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    try {
      const disconnected = new Promise<string>((resolve, reject) => {
        let settled = false
        let buffer = ''
        const clientRequest = http.request({
          hostname: '127.0.0.1', port, method: 'POST', path: '/api/agent/turns',
          headers: { 'Content-Type': 'application/json', Connection: 'close' },
        }, (response) => {
          response.setEncoding('utf8')
          response.on('data', (chunk: string) => {
            buffer += chunk
            const frames = eventsFrom(buffer)
            const delta = frames.find((event) => event.event === 'content_delta')
            if (!settled && delta?.id) {
              settled = true
              resolve(delta.id)
              response.destroy()
              clientRequest.destroy()
            }
          })
          response.on('error', (error) => { if (!settled) reject(error) })
        })
        clientRequest.on('error', (error) => { if (!settled) reject(error) })
        clientRequest.end(JSON.stringify(startBody('free_chat')))
      })
      await firstDelta
      const lastEventId = await disconnected
      await routeUnsubscribed
      expect(activeSubscriptions).toBe(0)
      expect((await turnStore.getTurn('turn-socket')).status).toBe('running')
      expect(runCount).toBe(1)

      const completed = new Promise<void>((resolve) => {
        const unsubscribe = turnStore.subscribe('turn-socket', (event) => {
          if (event.type === 'turn_completed') {
            unsubscribe()
            resolve()
          }
        })
      })
      releaseRunner?.()
      await completed

      const replayText = await new Promise<string>((resolve, reject) => {
        let body = ''
        const reconnect = http.request({
          hostname: '127.0.0.1', port, method: 'GET',
          path: '/api/agent/turns/turn-socket/events',
          headers: { 'Last-Event-ID': lastEventId, Connection: 'close' },
        }, (response) => {
          response.setEncoding('utf8')
          response.on('data', (chunk: string) => { body += chunk })
          response.on('end', () => resolve(body))
        })
        reconnect.on('error', reject)
        reconnect.end()
      })
      const replay = eventsFrom(replayText)
      expect(replay.every((event) => Number(event.id) > Number(lastEventId))).toBe(true)
      expect(replay.map((event) => event.event)).toEqual([
        'content_delta', 'citation', 'turn_completed',
      ])
      expect(replay.some((event) => event.data.payload?.text === 'first-delta')).toBe(false)
      expect(replay.some((event) => event.data.payload?.text === 'second-delta')).toBe(true)
      expect((await turnStore.getTurn('turn-socket')).status).toBe('completed')
      expect(runCount).toBe(1)
      expect(activeSubscriptions).toBe(0)
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) reject(error)
        else resolve()
      }))
    }
  })

  it('bounds a running subscription and emits heartbeat using injected timers', async () => {
    const scheduled: number[] = []
    const cleared: unknown[] = []
    const turnStore = {
      async getTurnForActor() { return { status: 'running' } },
      async listEventsAfterForActor() { return [] },
      subscribe(_turnId: string, _listener: (event: unknown) => void) { return () => undefined },
    }
    const runtime = {} as AgentRuntime
    const app = express()
    app.use('/api/agent', createAgentTurnsRouter({
      runtime,
      turnStore: turnStore as never,
      actorProvider: () => ({ userId: 'server-user', workspaceId: 'server-workspace' }),
      timers: {
        setInterval(callback, delay) {
          scheduled.push(delay)
          callback()
          return { kind: 'interval' }
        },
        setTimeout(callback, delay) {
          scheduled.push(delay)
          queueMicrotask(callback)
          return { kind: 'timeout' }
        },
        clear(timer) { cleared.push(timer) },
      },
    }))

    const response = await request(app).get('/api/agent/turns/turn-running/events')

    expect(response.text).toContain(': heartbeat\n\n')
    expect(scheduled).toEqual([15_000, 120_000])
    expect(cleared).toHaveLength(2)
  })
})
