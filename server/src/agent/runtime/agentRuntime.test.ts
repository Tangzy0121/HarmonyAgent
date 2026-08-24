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
import { LearningEvidenceService } from '../../learning/learningEvidenceService.js'
import {
  createProviderFeynmanEvaluator,
  type FeynmanEvaluator,
} from '../../learning/feynmanEvaluator.js'
import { ToolRegistry, type ToolId } from './toolRegistry.js'
import { createLearningEvidenceTools } from './tools/learningEvidenceTools.js'

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
      }, {
        id: 'quiz-1',
        type: 'quiz',
        status: 'ready',
        title: '标签小测',
        revision: 1,
        sourceAnchors: [],
        conceptId: 'concept-label',
        question: '哪个选项代表标签？',
        options: [
          { id: '答案.一', marker: 'A', text: '目标值' },
          { id: 'b', marker: 'B', text: '噪声' },
        ],
        correctAnswerId: '答案.一',
        feedback: '',
      }, {
        id: 'flash-1',
        type: 'flash_cards',
        status: 'ready',
        title: '标签卡片',
        revision: 1,
        sourceAnchors: [],
        cards: [{ front: '标签是什么？', back: '监督信号' }],
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

async function setup(
  runner?: BookAgentRunner,
  options: {
    createTurnId?: () => string
    feynmanEvaluator?: FeynmanEvaluator
    toolHooks?: {
      before?: (toolId: ToolId, signal?: AbortSignal) => void | Promise<void>
      after?: (toolId: ToolId, result: unknown) => void | Promise<void>
    }
  } = {},
) {
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
  const learningEvidenceService = new LearningEvidenceService({
    bookStore,
    owner: actor,
    now: () => new Date('2026-08-14T00:00:00.000Z'),
    createId: () => 'runtime-stable',
    receiptSecret: 'runtime-receipt-secret',
    feynmanDigestKey: 'runtime-feynman-key',
  })
  const feynmanEvaluator = options.feynmanEvaluator ?? {
    async evaluate() {
      return { passed: true, feedback: '评估通过', gap: '' }
    },
  }
  let toolRegistry: ToolRegistry | undefined
  if (options.toolHooks) {
    toolRegistry = new ToolRegistry()
    for (const tool of createLearningEvidenceTools(learningEvidenceService, { feynmanEvaluator })) {
      toolRegistry.register({
        ...tool,
        async execute(input, context, signal) {
          await options.toolHooks?.before?.(tool.id, signal)
          const result = await tool.execute(input, context, signal)
          await options.toolHooks?.after?.(tool.id, result)
          return result
        },
      })
    }
  }
  const runtime = new AgentRuntime({
    turnStore,
    contextBuilder: new LearningContextBuilder({ bookAccess: createSingleUserBookAccess(bookStore, actor) }),
    runner: defaultRunner,
    createTurnId: options.createTurnId ?? (() => 'turn-1'),
    now: () => new Date('2026-08-14T00:00:00.000Z'),
    learningEvidenceService,
    feynmanEvaluator,
    ...(toolRegistry ? { toolRegistry } : {}),
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
  it('routes a guided quiz action through the mounted production write tool', async () => {
    let runnerCalls = 0
    const { runtime, turnStore, bookStore } = await setup({
      isConfigured: () => true,
      reportInternalError: () => undefined,
      async run() { runnerCalls += 1; return {} },
    })

    const started = await runtime.start({
      ...request('guided_learning', {
        bookId: 'book_one', chapterId: 'chapter-1', blockId: 'quiz-1',
      }),
      action: { type: 'grade_quiz', answerId: '答案.一' },
    }, actor)
    await started.completion

    expect(runnerCalls).toBe(0)
    expect((await bookStore.get('book_one'))?.quizAttempts).toHaveLength(1)
    expect((await bookStore.get('book_one'))?.evidence[0]).toMatchObject({ kind: 'quiz' })
    expect((await turnStore.listEventsAfter('turn-1')).map((event) => event.type)).toEqual([
      'turn_started', 'activity', 'evidence_recorded', 'turn_completed',
    ])
  })

  it('evaluates and appends Feynman evidence internally without persisting a receipt or action', async () => {
    const raw = '这是只用于服务端评估的私密复述'
    const providerFeedback = '只用于服务端的私密评估反馈'
    const toolCalls: ToolId[] = []
    let receipt: string | undefined
    const { runtime, turnStore, bookStore } = await setup(undefined, {
      feynmanEvaluator: {
        async evaluate() {
          return { passed: true, feedback: providerFeedback, gap: '' }
        },
      },
      toolHooks: {
        before(toolId) { toolCalls.push(toolId) },
        after(toolId, result) {
          if (toolId === 'evaluate_feynman') {
            receipt = (result as { receipt?: string }).receipt
          }
        },
      },
    })
    const evaluated = await runtime.start({
      ...request('guided_learning', { bookId: 'book_one', chapterId: 'chapter-1' }),
      action: { type: 'evaluate_feynman', confirmedText: raw },
    }, actor)
    await evaluated.completion

    expect(toolCalls).toEqual(['evaluate_feynman', 'append_evidence'])
    expect(typeof receipt).toBe('string')
    expect((await bookStore.get('book_one'))?.evidence[0]).toMatchObject({ kind: 'feynman' })
    expect((await bookStore.get('book_one'))?.evidence).toHaveLength(1)
    const events = await turnStore.listEventsAfter('turn-1')
    expect(events.map((event) => event.type)).toEqual([
      'turn_started', 'activity', 'evidence_recorded', 'turn_completed',
    ])
    expect(events.find((event) => event.type === 'evidence_recorded')?.payload).toEqual({
      tools: ['evaluate_feynman', 'append_evidence'],
      evidenceId: 'evidence_runtime-stable',
      projectionStatus: 'projected',
    })
    const persisted = JSON.stringify(await turnStore.getTurn('turn-1'))
    expect(persisted).not.toContain(String(receipt))
    expect(persisted).not.toContain('"receipt"')
    expect(persisted).not.toContain('"action"')
    expect(persisted).not.toContain('nextAction')
    expect(persisted).not.toContain(raw)
    expect(persisted).not.toContain(providerFeedback)
  })

  it('fails the turn when the internal append fails without exposing the receipt', async () => {
    let receipt: string | undefined
    const { runtime, turnStore, bookStore } = await setup(undefined, {
      toolHooks: {
        before(toolId) {
          if (toolId === 'append_evidence') throw new Error('private_append_failure')
        },
        after(toolId, result) {
          if (toolId === 'evaluate_feynman') {
            receipt = (result as { receipt?: string }).receipt
          }
        },
      },
    })

    const started = await runtime.start({
      ...request('guided_learning', { bookId: 'book_one', chapterId: 'chapter-1' }),
      action: { type: 'evaluate_feynman', confirmedText: '失败路径私密复述' },
    }, actor)
    await started.completion

    expect(typeof receipt).toBe('string')
    expect((await bookStore.get('book_one'))?.evidence).toEqual([])
    const record = await turnStore.getTurn('turn-1')
    expect(record.status).toBe('failed')
    expect(record.events.at(-1)).toMatchObject({
      type: 'turn_failed', payload: { code: 'agent_failed' },
    })
    expect(JSON.stringify(record)).not.toContain(String(receipt))
    expect(JSON.stringify(record)).not.toContain('private_append_failure')
  })

  it('cancels while the internal append is pending without writing learning state', async () => {
    let markAppendStarted: (() => void) | undefined
    const appendStarted = new Promise<void>((resolve) => { markAppendStarted = resolve })
    const { runtime, turnStore, bookStore } = await setup(undefined, {
      toolHooks: {
        async before(toolId, signal) {
          if (toolId !== 'append_evidence') return
          markAppendStarted?.()
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
          })
        },
      },
    })

    const started = await runtime.start({
      ...request('guided_learning', { bookId: 'book_one', chapterId: 'chapter-1' }),
      action: { type: 'evaluate_feynman', confirmedText: '追加前取消的私密复述' },
    }, actor)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('append_not_started')), 250)
      appendStarted.then(() => {
        clearTimeout(timeout)
        resolve()
      }, reject)
    })
    await runtime.cancel('turn-1', actor)
    await started.completion

    const saved = await bookStore.get('book_one')
    expect(saved?.evidence).toEqual([])
    expect(saved?.projectionOutbox ?? {}).toEqual({})
    expect(saved?.masteryProjectionReadModel ?? {}).toEqual({})
    expect((await turnStore.getTurn('turn-1')).status).toBe('cancelled')
  })

  it('cancels a pending Feynman fetch without writing learning state', async () => {
    let providerSignal: AbortSignal | undefined
    let markFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>((resolve) => { markFetchStarted = resolve })
    const evaluator = createProviderFeynmanEvaluator({
      env: { LLM_API_KEY: 'server-key' },
      timeoutMs: 60_000,
      timers: {
        setTimeout: () => 'timeout-handle',
        clearTimeout: () => undefined,
      },
      fetchImpl: async (_url, init) => {
        providerSignal = init?.signal ?? undefined
        markFetchStarted?.()
        return new Promise((_resolve, reject) => {
          providerSignal?.addEventListener('abort', () => reject(providerSignal?.reason), {
            once: true,
          })
        })
      },
    })
    const { runtime, turnStore, bookStore } = await setup(undefined, {
      feynmanEvaluator: evaluator,
    })

    const started = await runtime.start({
      ...request('guided_learning', { bookId: 'book_one', chapterId: 'chapter-1' }),
      action: { type: 'evaluate_feynman', confirmedText: '取消中的私密复述' },
    }, actor)
    await fetchStarted
    await runtime.cancel('turn-1', actor)
    await started.completion

    const saved = await bookStore.get('book_one')
    expect(providerSignal?.aborted).toBe(true)
    expect(saved?.evidence).toEqual([])
    expect(saved?.projectionOutbox ?? {}).toEqual({})
    expect(saved?.masteryProjectionReadModel ?? {}).toEqual({})
    expect((await turnStore.getTurn('turn-1')).status).toBe('cancelled')
  })

  it('schedules review from the authoritative flash-card block and result', async () => {
    const { runtime, bookStore } = await setup()
    const started = await runtime.start({
      ...request('guided_learning', {
        bookId: 'book_one', chapterId: 'chapter-1', blockId: 'flash-1',
      }),
      action: { type: 'schedule_review', result: 'forgotten' },
    }, actor)
    await started.completion

    expect((await bookStore.get('book_one'))?.evidence[0]).toMatchObject({
      kind: 'review', payload: { remembered: false },
    })
    expect((await bookStore.get('book_one'))?.reviewSchedule?.['flash-1']).toBeDefined()
  })

  it('rejects Feynman evaluation for free_chat through the mounted allowlist', async () => {
    let runnerCalls = 0
    const { runtime, turnStore, bookStore } = await setup({
      isConfigured: () => true,
      reportInternalError: () => undefined,
      async run() { runnerCalls += 1; return {} },
    })

    const started = await runtime.start({
      ...request('free_chat', {
        bookId: 'book_one', chapterId: 'chapter-1',
      }),
      action: { type: 'evaluate_feynman', confirmedText: '不得处理的私密复述' },
    }, actor)
    await started.completion

    expect(runnerCalls).toBe(0)
    expect((await bookStore.get('book_one'))?.evidence).toEqual([])
    expect((await turnStore.getTurn('turn-1')).status).toBe('failed')
    expect((await turnStore.listEventsAfter('turn-1')).at(-1)).toMatchObject({
      type: 'turn_failed', payload: { code: 'agent_failed' },
    })
  })

  it('treats submit_quiz message text as ordinary chat and never as a side effect', async () => {
    let runnerCalls = 0
    const { runtime, bookStore } = await setup({
      isConfigured: () => true,
      reportInternalError: () => undefined,
      async run() { runnerCalls += 1; return {} },
    })
    const started = await runtime.start({
      ...request('guided_learning', {
        bookId: 'book_one', chapterId: 'chapter-1', blockId: 'quiz-1',
      }),
      message: 'submit_quiz:a',
    }, actor)
    await started.completion

    expect(runnerCalls).toBe(1)
    expect((await bookStore.get('book_one'))?.evidence).toEqual([])
  })

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
