import { randomUUID } from 'node:crypto'

import type { AgentEventEnvelopeV1 } from './agentEvent.js'
import type {
  CapabilityId,
  RuntimeActor,
  StartTurnActionV1,
  StartTurnRequestV1,
} from './agentRuntimeTypes.js'
import type { BookAgentRunner } from './bookAgentRunner.js'
import {
  buildBookAgentRequest,
  FreeChatCapability,
} from './capabilities/freeChatCapability.js'
import { GuidedLearningCapability } from './capabilities/guidedLearningCapability.js'
import {
  createDefaultCapabilityRegistry,
  type CapabilityRegistry,
} from './capabilityRegistry.js'
import type { LearningContext, LearningContextBuilder } from './learningContext.js'
import { askUserTool } from './tools/askUserTool.js'
import { readLearningStateTool } from './tools/readLearningStateTool.js'
import { readSourceTool } from './tools/readSourceTool.js'
import {
  ToolRegistry,
  type MountedToolRegistry,
  type ToolId,
} from './toolRegistry.js'
import type { RecordAnswerInput, TurnRecord, TurnStore } from './turnStore.js'
import type { LearningEvidenceService } from '../../learning/learningEvidenceService.js'
import { registerLearningEvidenceTools } from './tools/learningEvidenceTools.js'
import type { FeynmanEvaluator } from '../../learning/feynmanEvaluator.js'

const FAILURE_MESSAGE = '学习助手生成失败，请稍后重试。'

function learningActionInput(
  context: LearningContext,
  action: StartTurnActionV1,
): { toolId: StartTurnActionV1['type']; input: Record<string, unknown> } {
  if (action.type === 'grade_quiz') {
    return { toolId: action.type, input: { blockId: context.authority.block?.id, answerId: action.answerId } }
  }
  if (action.type === 'evaluate_feynman') {
    return { toolId: action.type, input: { confirmedText: action.confirmedText } }
  }
  return { toolId: action.type, input: { blockId: context.authority.block?.id, result: action.result } }
}

export interface RuntimeStartResult {
  turnId: string
  completion: Promise<void>
}

interface AgentRuntimeDependencies {
  turnStore: TurnStore
  contextBuilder: LearningContextBuilder
  runner: BookAgentRunner
  createTurnId?: () => string
  now?: () => Date
  toolRegistry?: ToolRegistry
  capabilityRegistry?: CapabilityRegistry
  learningEvidenceService?: LearningEvidenceService
  feynmanEvaluator?: FeynmanEvaluator
}

export class AgentRuntime {
  private readonly turnStore: TurnStore
  private readonly contextBuilder: LearningContextBuilder
  private readonly runner: BookAgentRunner
  private readonly createTurnId: () => string
  private readonly now: () => Date
  private readonly toolRegistry: ToolRegistry
  private readonly capabilityRegistry: CapabilityRegistry
  private readonly controllers = new Map<string, AbortController>()
  private readonly completions = new Map<string, Promise<void>>()
  private readonly resumeQueues = new Map<string, Promise<void>>()

  constructor(dependencies: AgentRuntimeDependencies) {
    this.turnStore = dependencies.turnStore
    this.contextBuilder = dependencies.contextBuilder
    this.runner = dependencies.runner
    this.createTurnId = dependencies.createTurnId ?? (() => `turn-${randomUUID()}`)
    this.now = dependencies.now ?? (() => new Date())
    this.toolRegistry = dependencies.toolRegistry ?? new ToolRegistry()
    if (!dependencies.toolRegistry) {
      this.toolRegistry.register(readSourceTool)
      this.toolRegistry.register(readLearningStateTool)
      this.toolRegistry.register(askUserTool)
      if (dependencies.learningEvidenceService) {
        registerLearningEvidenceTools(this.toolRegistry, dependencies.learningEvidenceService, {
          feynmanEvaluator: dependencies.feynmanEvaluator,
        })
      }
    }
    this.capabilityRegistry = dependencies.capabilityRegistry ?? createDefaultCapabilityRegistry()
  }

  private append(
    turnId: string,
    actor: RuntimeActor,
    type: AgentEventEnvelopeV1['type'],
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<AgentEventEnvelopeV1> {
    return this.turnStore.commitTurn(turnId, {
      actor,
      expectedStatuses: ['running'],
      event: {
        type,
        payload,
        idempotencyKey,
        timestamp: this.now().toISOString(),
      },
    }).then((result) => result.event as AgentEventEnvelopeV1)
  }

  private trackCompletion(turnId: string, operation: Promise<void>): Promise<void> {
    const tracked = operation.finally(() => {
      if (this.completions.get(turnId) === tracked) this.completions.delete(turnId)
    })
    this.completions.set(turnId, tracked)
    return tracked
  }

  private async serializeResume<T>(turnId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.resumeQueues.get(turnId) ?? Promise.resolve()
    const running = previous.catch(() => undefined).then(action)
    const tail = running.then(() => undefined, () => undefined)
    this.resumeQueues.set(turnId, tail)
    try {
      return await running
    } finally {
      if (this.resumeQueues.get(turnId) === tail) this.resumeQueues.delete(turnId)
    }
  }

  async start(request: StartTurnRequestV1, actor: RuntimeActor): Promise<RuntimeStartResult> {
    const turnId = this.createTurnId()
    const capabilityId = request.capabilityHint ?? 'free_chat'
    const { action: _privateAction, ...persistedRequest } = request
    await this.turnStore.createTurn({
      turnId,
      actor,
      request: persistedRequest,
      capabilityId,
      initialStatus: 'running',
      initialEvent: {
        type: 'turn_started',
        payload: { capability: capabilityId, surface: request.surface },
        idempotencyKey: `${turnId}:started`,
        timestamp: this.now().toISOString(),
      },
    })
    const completion = this.trackCompletion(
      turnId,
      this.execute(turnId, request, actor, capabilityId, false),
    )
    return { turnId, completion }
  }

  private async askForSelection(
    turnId: string,
    actor: RuntimeActor,
    context: LearningContext,
    mountedTools: MountedToolRegistry,
  ): Promise<void> {
    const selectionStep = context.authority.book ? 'chapter' : 'book'
    const options = selectionStep === 'chapter'
      ? context.authority.book?.chapters.map((chapter) => chapter.id) ?? []
      : context.availableBookIds
    if (options.length === 0) throw new Error('authoritative_selection_unavailable')
    const request = await mountedTools.invoke('ask_user', {
      prompt: selectionStep === 'book'
        ? '请选择要继续学习的书籍。'
        : '请选择要继续学习的章节。',
      options,
      allowFreeText: true,
    }) as { prompt: string; options: string[]; allowFreeText: boolean }
    const question = {
      questionId: `${turnId}:${selectionStep}`,
      prompt: request.prompt,
      options: request.options,
      allowFreeText: request.allowFreeText,
      askedAt: this.now().toISOString(),
    }
    await this.turnStore.commitTurn(turnId, {
      actor,
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
        idempotencyKey: `${turnId}:question:${selectionStep}`,
        timestamp: this.now().toISOString(),
      },
      pendingQuestion: question,
      checkpoint: {
        capabilityId: 'guided_learning',
        refs: context.refs,
        confirmedOutput: '',
        completedSteps: ['context_loaded'],
        selectionStep,
      },
    })
  }

  private async execute(
    turnId: string,
    request: StartTurnRequestV1,
    actor: RuntimeActor,
    capabilityId: CapabilityId,
    resumed: boolean,
  ): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(turnId, controller)
    try {
      await this.append(turnId, actor, 'activity', {
        label: resumed ? '正在继续学习' : '正在核对学习上下文',
      }, `${turnId}:activity:${resumed ? 'resume' : 'start'}`)
      const context = await this.contextBuilder.build(request, actor, capabilityId)
      const mountedTools = this.capabilityRegistry.mount(
        capabilityId,
        context,
        this.toolRegistry,
      )
      const action = request.action === undefined ? undefined : learningActionInput(context, request.action)
      if (action) {
        let result = await mountedTools.invoke(action.toolId, action.input, controller.signal) as {
          evidence?: { id?: unknown }
          projectionStatus?: unknown
          receipt?: unknown
        }
        controller.signal.throwIfAborted()
        const executedTools: ToolId[] = [action.toolId]
        if (action.toolId === 'evaluate_feynman') {
          if (typeof result.receipt !== 'string') throw new Error('invalid_tool_result')
          result = await mountedTools.invoke(
            'append_evidence',
            { receipt: result.receipt },
            controller.signal,
          ) as typeof result
          executedTools.push('append_evidence')
          controller.signal.throwIfAborted()
        }
        if (typeof result.evidence?.id === 'string') {
          await this.append(turnId, actor, 'evidence_recorded', {
            ...(executedTools.length === 1
              ? { tool: executedTools[0] }
              : { tools: executedTools }),
            evidenceId: result.evidence.id,
            ...(result.projectionStatus === 'projected' || result.projectionStatus === 'pending'
              ? { projectionStatus: result.projectionStatus }
              : {}),
          }, `${turnId}:evidence:${action.toolId}`)
        }
        const completionPayload: Record<string, unknown> = { status: 'completed' }
        controller.signal.throwIfAborted()
        await this.turnStore.commitTurn(turnId, {
          actor,
          expectedStatuses: ['running'],
          nextStatus: 'completed',
          event: {
            type: 'turn_completed',
            payload: completionPayload,
            idempotencyKey: `${turnId}:completed`,
            timestamp: this.now().toISOString(),
          },
          pendingQuestion: null,
        })
        return
      }
      if (capabilityId === 'guided_learning' && !context.authority.chapter) {
        await this.askForSelection(turnId, actor, context, mountedTools)
        return
      }
      if (!this.runner.isConfigured()) throw new Error('agent_not_configured')

      const before = await this.turnStore.listEventsAfter(turnId)
      let deltaIndex = before.filter((event) => event.type === 'content_delta').length
      const capability = capabilityId === 'guided_learning'
        ? new GuidedLearningCapability(this.runner)
        : new FreeChatCapability(this.runner)
      await capability.run(context, request.message, {
        onDelta: async (text) => {
          deltaIndex += 1
          await this.append(
            turnId,
            actor,
            'content_delta',
            { text },
            `${turnId}:delta:${deltaIndex}`,
          )
        },
      }, controller.signal)

      const bookRequest = buildBookAgentRequest(context, request.message)
      for (const source of bookRequest.context?.sources ?? []) {
        await this.append(turnId, actor, 'citation', {
          sourceId: source.id,
          documentSourceId: source.sourceId,
          fileName: source.fileName,
          pageRange: source.pageRange,
        }, `${turnId}:citation:${source.id}`)
      }
      await this.turnStore.commitTurn(turnId, {
        actor,
        expectedStatuses: ['running'],
        nextStatus: 'completed',
        event: {
          type: 'turn_completed',
          payload: { status: 'completed' },
          idempotencyKey: `${turnId}:completed`,
          timestamp: this.now().toISOString(),
        },
        pendingQuestion: null,
      })
    } catch {
      const record = await this.turnStore.getTurnForActor(turnId, actor)
      if (record.status === 'cancelled' || record.status === 'completed') return
      await this.turnStore.commitTurn(turnId, {
        actor,
        expectedStatuses: ['queued', 'running', 'waiting_user', 'retrying'],
        nextStatus: 'failed',
        event: {
          type: 'turn_failed',
          payload: { code: 'agent_failed', message: FAILURE_MESSAGE },
          idempotencyKey: `${turnId}:failed`,
          timestamp: this.now().toISOString(),
        },
        pendingQuestion: null,
        failureCode: 'agent_failed',
      })
    } finally {
      if (this.controllers.get(turnId) === controller) this.controllers.delete(turnId)
    }
  }

  async resume(
    turnId: string,
    actor: RuntimeActor,
    input: RecordAnswerInput,
  ): Promise<RuntimeStartResult> {
    return this.serializeResume(turnId, async () => {
      const resumed = await this.turnStore.resumeWithAnswer(turnId, actor, input)
      const active = this.completions.get(turnId)
      if (active) return { turnId, completion: active }
      if (resumed.duplicate) {
        return { turnId, completion: Promise.resolve() }
      }
      const record = resumed.record
      const request: StartTurnRequestV1 = {
        ...record.request,
        refs: record.checkpoint?.selectionStep === 'book'
          ? { bookId: resumed.answer.answer }
          : {
              ...(record.checkpoint?.refs ?? record.request.refs),
              chapterId: resumed.answer.answer,
            },
      }
      const completion = this.trackCompletion(turnId, this.execute(
        turnId,
        request,
        actor,
        record.checkpoint?.capabilityId ?? record.capabilityId,
        true,
      ))
      return { turnId, completion }
    })
  }

  async cancel(turnId: string, actor: RuntimeActor): Promise<TurnRecord> {
    await this.turnStore.getTurnForActor(turnId, actor)
    const result = await this.turnStore.commitTurn(turnId, {
      actor,
      expectedStatuses: ['queued', 'running', 'waiting_user', 'retrying'],
      nextStatus: 'cancelled',
      event: {
        type: 'turn_failed',
        payload: { code: 'cancelled', message: '本轮已取消。' },
        idempotencyKey: `${turnId}:cancelled`,
        timestamp: this.now().toISOString(),
      },
      pendingQuestion: null,
    })
    this.controllers.get(turnId)?.abort(new DOMException('Turn cancelled', 'AbortError'))
    return result.record
  }
}
