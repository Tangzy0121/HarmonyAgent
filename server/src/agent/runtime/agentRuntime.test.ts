import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBookStore } from '../../books/bookStore.js'
import type { StoredBook } from '../../books/bookTypes.js'
import { AgentRuntime } from './agentRuntime.js'
import type { StartTurnRequestV1 } from './agentRuntimeTypes.js'
import type { BookAgentRunner } from './bookAgentRunner.js'
import { createSingleUserBookAccess, LearningContextBuilder } from './learningContext.js'
import { createTurnStore } from './turnStore.js'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function storedBook(): StoredBook {
  const now = '2026-08-14T00:00:00.000Z'
  return {
    id: 'book_one',
    source: {
      id: 'document-1',
      fileName: 'lecture.pdf',
      format: 'PDF',
      pageCount: 8,
      sizeLabel: '1 MB',
      updatedLabel: '今天',
    },
    goal: '理解概念',
    learnerLevel: '入门',
    proposal: {
      title: '机器学习入门',
      description: 'desc',
      rationale: 'why',
      estimatedMinutes: 20,
    },
    status: 'ready',
    chapters: [{
      id: 'chapter-1',
      title: '监督学习',
      order: 1,
      objective: '理解标签',
      coreConceptId: 'concept-label',
      estimatedMinutes: 10,
      sourceAnchors: [],
      status: 'ready',
      blocks: [{
        id: 'block-1',
        type: 'explanation',
        status: 'ready',
        title: '标签',
        revision: 1,
        sourceAnchors: [{
          sourceId: 'source-1',
          fileName: 'lecture.pdf',
          pageRange: '4-5',
          excerpt: '训练数据包含输入和对应标签。',
        }],
        body: '标签为训练样本提供目标。',
        keyPoint: '标签',
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

async function setup(runner?: BookAgentRunner) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-'))
  roots.push(root)
  const bookStore = createBookStore(path.join(root, 'books'))
  await bookStore.save(storedBook())
  const turnStore = createTurnStore(path.join(root, 'turns'))
  const defaultRunner: BookAgentRunner = runner ?? {
    isConfigured: () => true,
    reportInternalError: () => undefined,
    async run(_request, callbacks) {
      await callbacks.onDelta('标签提供学习目标。[S1]')
      return {}
    },
  }
  const runtime = new AgentRuntime({
    turnStore,
    contextBuilder: new LearningContextBuilder({ bookAccess: createSingleUserBookAccess(bookStore, actor) }),
    runner: defaultRunner,
    createTurnId: () => 'turn-1',
    now: () => new Date('2026-08-14T00:00:00.000Z'),
  })
  return { runtime, turnStore, bookStore }
}

function request(
  capabilityHint: 'free_chat' | 'guided_learning',
  refs: StartTurnRequestV1['refs'],
): StartTurnRequestV1 {
  return {
    version: '1',
    message: '解释标签',
    surface: 'learning',
    refs,
    capabilityHint,
  }
}

const actor = { userId: 'server-user', workspaceId: 'server-workspace' }

describe('AgentRuntime', () => {
  it('runs free_chat without writing evidence', async () => {
    const { runtime, turnStore, bookStore } = await setup()

    const started = await runtime.start(request('free_chat', {
      bookId: 'book_one',
      chapterId: 'chapter-1',
    }), actor)
    await started.completion

    expect((await turnStore.getTurn('turn-1')).status).toBe('completed')
    expect((await turnStore.listEventsAfter('turn-1')).map((event) => event.type)).toEqual([
      'turn_started',
      'activity',
      'content_delta',
      'citation',
      'turn_completed',
    ])
    expect((await turnStore.listEventsAfter('turn-1')).some((event) =>
      event.type === 'evidence_recorded')).toBe(false)
    expect((await bookStore.get('book_one'))?.evidence).toEqual([])
  })

  it('grounds guided_learning in authoritative context and emits a citation', async () => {
    const runner: BookAgentRunner = {
      isConfigured: () => true,
      reportInternalError: () => undefined,
      async run(bookRequest, callbacks) {
        expect(bookRequest.context?.bookId).toBe('book_one')
        expect(bookRequest.context?.chapters[0].id).toBe('chapter-1')
        expect(bookRequest.context?.sources[0]).toMatchObject({
          sourceId: 'source-1',
          pageRange: '4-5',
        })
        await callbacks.onDelta('标签提供监督信号。[S1]')
        return {}
      },
    }
    const { runtime, turnStore } = await setup(runner)

    const started = await runtime.start(request('guided_learning', {
      bookId: 'book_one',
      chapterId: 'chapter-1',
      blockId: 'block-1',
    }), actor)
    await started.completion

    const citation = (await turnStore.listEventsAfter('turn-1'))
      .find((event) => event.type === 'citation')
    expect(citation?.payload).toEqual({
      sourceId: 'S1',
      documentSourceId: 'source-1',
      fileName: 'lecture.pdf',
      pageRange: '4-5',
    })
  })

  it('asks the user when guided_learning has no authoritative chapter and resumes in place', async () => {
    const { runtime, turnStore } = await setup()

    const started = await runtime.start(request('guided_learning', { bookId: 'book_one' }), actor)
    await started.completion
    const waiting = await turnStore.getTurn('turn-1')
    expect(waiting.status).toBe('waiting_user')
    expect(waiting.pendingQuestion).toMatchObject({
      questionId: 'turn-1:chapter',
      options: ['chapter-1'],
      allowFreeText: true,
    })
    expect(waiting.checkpoint).toEqual({
      capabilityId: 'guided_learning',
      refs: { bookId: 'book_one', documentId: 'document-1' },
      confirmedOutput: '',
      completedSteps: ['context_loaded'],
      selectionStep: 'chapter',
    })
    const before = await turnStore.listEventsAfter('turn-1')

    const resumed = await runtime.resume('turn-1', actor, {
      questionId: 'turn-1:chapter',
      answer: 'chapter-1',
      idempotencyKey: 'answer-1',
    })
    await resumed.completion
    const after = await turnStore.listEventsAfter('turn-1')

    expect((await turnStore.getTurn('turn-1')).status).toBe('completed')
    expect(after.filter((event) => event.type === 'turn_started')).toHaveLength(1)
    expect(after.slice(0, before.length)).toEqual(before)
    expect(new Set(after.map((event) => event.eventId)).size).toBe(after.length)

    const duplicate = await runtime.resume('turn-1', actor, {
      questionId: 'turn-1:chapter',
      answer: 'must-not-run-again',
      idempotencyKey: 'answer-1',
    })
    await duplicate.completion
    expect(await turnStore.listEventsAfter('turn-1')).toEqual(after)
  })

  it('recovers guided_learning with empty refs through book then chapter selection', async () => {
    let runCount = 0
    const { runtime, turnStore } = await setup({
      isConfigured: () => true,
      reportInternalError: () => undefined,
      async run(_request, callbacks) {
        runCount += 1
        await callbacks.onDelta('基于权威章节的回答。[S1]')
        return {}
      },
    })

    const started = await runtime.start(request('guided_learning', {}), actor)
    await started.completion
    const chooseBook = await turnStore.getTurn('turn-1')
    expect(chooseBook.status).toBe('waiting_user')
    expect(chooseBook.pendingQuestion).toMatchObject({
      questionId: 'turn-1:book', options: ['book_one'],
    })
    expect(chooseBook.pendingQuestion?.options).not.toHaveLength(0)

    const bookAnswer = await runtime.resume('turn-1', actor, {
      questionId: 'turn-1:book', answer: 'book_one', idempotencyKey: 'answer-book',
    })
    await bookAnswer.completion
    const chooseChapter = await turnStore.getTurn('turn-1')
    expect(chooseChapter.status).toBe('waiting_user')
    expect(chooseChapter.pendingQuestion).toMatchObject({
      questionId: 'turn-1:chapter', options: ['chapter-1'],
    })
    expect(chooseChapter.pendingQuestion?.options).not.toHaveLength(0)

    const chapterAnswer = await runtime.resume('turn-1', actor, {
      questionId: 'turn-1:chapter', answer: 'chapter-1', idempotencyKey: 'answer-chapter',
    })
    await chapterAnswer.completion

    expect((await turnStore.getTurn('turn-1')).status).toBe('completed')
    expect(runCount).toBe(1)
  })

  it('maps failures to a safe event without hidden reasoning, raw tool arguments or user content', async () => {
    const privateText = '解释标签 secret-key raw-tool-arguments hidden-chain-of-thought'
    const runner: BookAgentRunner = {
      isConfigured: () => true,
      reportInternalError: () => undefined,
      async run() {
        throw new Error(privateText)
      },
    }
    const { runtime, turnStore } = await setup(runner)

    const started = await runtime.start(request('free_chat', { bookId: 'book_one' }), actor)
    await started.completion

    const failed = (await turnStore.listEventsAfter('turn-1')).at(-1)
    expect(failed).toMatchObject({
      type: 'turn_failed',
      payload: { code: 'agent_failed', message: '学习助手生成失败，请稍后重试。' },
    })
    expect(JSON.stringify(failed)).not.toContain(privateText)
    expect(JSON.stringify(failed)).not.toContain('raw-tool-arguments')
    expect((await turnStore.getTurn('turn-1')).status).toBe('failed')
  })

  it('cancels an active provider run without deleting the turn or emitting a second failure', async () => {
    let markStarted: (() => void) | undefined
    const runnerStarted = new Promise<void>((resolve) => { markStarted = resolve })
    let observedSignal: AbortSignal | undefined
    const runner: BookAgentRunner = {
      isConfigured: () => true,
      reportInternalError: () => undefined,
      async run(_request, _callbacks, options) {
        observedSignal = options?.signal
        markStarted?.()
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          })
        })
      },
    }
    const { runtime, turnStore } = await setup(runner)
    const started = await runtime.start(request('free_chat', { bookId: 'book_one' }), actor)
    await runnerStarted

    const cancelled = await runtime.cancel('turn-1', actor)
    await started.completion

    expect(observedSignal?.aborted).toBe(true)
    expect(cancelled.status).toBe('cancelled')
    expect((await turnStore.getTurn('turn-1')).status).toBe('cancelled')
    const failures = (await turnStore.listEventsAfter('turn-1'))
      .filter((event) => event.type === 'turn_failed')
    expect(failures).toHaveLength(1)
    expect(failures[0].payload).toEqual({ code: 'cancelled', message: '本轮已取消。' })
  })

  it('does not rewrite or change updatedAt when cancel is repeated', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-cancel-idempotent-'))
    roots.push(root)
    const bookStore = createBookStore(path.join(root, 'books'))
    await bookStore.save(storedBook())
    let nowValue = Date.parse('2026-08-14T00:00:00.000Z')
    let writeCount = 0
    const turnStore = createTurnStore(path.join(root, 'turns'), {
      now: () => new Date(nowValue),
      beforeRename: () => { writeCount += 1 },
    })
    const runtime = new AgentRuntime({
      turnStore,
      contextBuilder: new LearningContextBuilder({
        bookAccess: createSingleUserBookAccess(bookStore, actor),
      }),
      runner: {
        isConfigured: () => true,
        reportInternalError: () => undefined,
        async run() { return {} },
      },
      createTurnId: () => 'turn-idempotent-cancel',
      now: () => new Date(nowValue),
    })
    const started = await runtime.start(
      request('guided_learning', { bookId: 'book_one' }),
      actor,
    )
    await started.completion

    nowValue += 1_000
    const first = await runtime.cancel('turn-idempotent-cancel', actor)
    const writesAfterFirst = writeCount
    nowValue += 1_000
    const repeated = await runtime.cancel('turn-idempotent-cancel', actor)

    expect(repeated.updatedAt).toBe(first.updatedAt)
    expect(writeCount).toBe(writesAfterFirst)
    expect(repeated.events.filter((event) => event.payload.code === 'cancelled')).toHaveLength(1)
  })

  it('does not persist a question event when the waiting_user transaction fails before rename', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-atomic-'))
    roots.push(root)
    const bookStore = createBookStore(path.join(root, 'books'))
    await bookStore.save(storedBook())
    const turnStore = createTurnStore(path.join(root, 'turns'), {
      beforeRename: async (temporaryPath) => {
        const candidate = JSON.parse(await readFile(temporaryPath, 'utf8')) as { status: string }
        if (candidate.status === 'waiting_user') throw new Error('injected_waiting_write_failure')
      },
    })
    const runtime = new AgentRuntime({
      turnStore,
      contextBuilder: new LearningContextBuilder({ bookAccess: createSingleUserBookAccess(bookStore, actor) }),
      runner: {
        isConfigured: () => true,
        reportInternalError: () => undefined,
        async run() { return {} },
      },
      createTurnId: () => 'turn-atomic',
    })

    const started = await runtime.start(
      request('guided_learning', { bookId: 'book_one' }),
      actor,
    )
    await started.completion

    const record = await turnStore.getTurn('turn-atomic')
    expect(record.status).toBe('failed')
    expect(record.pendingQuestion).toBeUndefined()
    expect(record.events.some((event) => event.type === 'user_question')).toBe(false)
    expect(record.events.at(-1)?.type).toBe('turn_failed')
  })
})
