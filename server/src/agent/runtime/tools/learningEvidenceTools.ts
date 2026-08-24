import type { LearningEvidenceService } from '../../../learning/learningEvidenceService.js'
import type { FeynmanEvaluator } from '../../../learning/feynmanEvaluator.js'
import type { LearningContext } from '../learningContext.js'
import type { ToolDefinition, ToolRegistry } from '../toolRegistry.js'

interface LearningEvidenceToolDependencies {
  feynmanEvaluator?: FeynmanEvaluator
}

export class LearningEvidenceToolError extends Error {
  readonly code = 'invalid_tool_input' as const

  constructor() {
    super('invalid_tool_input')
    this.name = 'LearningEvidenceToolError'
  }
}

function invalid(): never {
  throw new LearningEvidenceToolError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bookId(context: LearningContext): string {
  return context.authority.book?.id ?? invalid()
}

function scopedBlockId(value: unknown, context: LearningContext): string {
  if (typeof value !== 'string' || !context.readScope.blockIds.includes(value)) invalid()
  return value
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid()
  return value.trim()
}

export function createLearningEvidenceTools(
  service: LearningEvidenceService,
  dependencies: LearningEvidenceToolDependencies = {},
): ToolDefinition[] {
  return [{
    id: 'grade_quiz',
    access: 'write',
    async execute(input, context, signal) {
      if (!isRecord(input)) invalid()
      signal?.throwIfAborted()
      return service.recordQuiz(context.actor, {
        bookId: bookId(context),
        blockId: scopedBlockId(input.blockId ?? context.refs.blockId, context),
        answerId: text(input.answerId),
        signal,
      })
    },
  }, {
    id: 'evaluate_feynman',
    access: 'write',
    async execute(input, context, signal) {
      if (!isRecord(input) || !dependencies.feynmanEvaluator) invalid()
      const chapter = context.authority.chapter ?? invalid()
      const confirmedText = text(input.confirmedText)
      const result = await dependencies.feynmanEvaluator.evaluate(
        { confirmedText, chapter }, { signal },
      )
      if (
        typeof result.passed !== 'boolean' || typeof result.feedback !== 'string' ||
        !result.feedback.trim() || typeof result.gap !== 'string'
      ) invalid()
      signal?.throwIfAborted()
      const receipt = await service.issueFeynmanEvidenceReceipt(context.actor, {
        bookId: bookId(context), chapterId: chapter.id, confirmedText,
        result: {
          passed: result.passed, feedback: result.feedback.trim(), gap: result.gap.trim(),
        },
        signal,
      })
      signal?.throwIfAborted()
      return { receipt }
    },
  }, {
    id: 'append_evidence',
    access: 'write',
    async execute(input, context, signal) {
      if (!isRecord(input)) invalid()
      signal?.throwIfAborted()
      return service.appendEvidence(context.actor, bookId(context), text(input.receipt), signal)
    },
  }, {
    id: 'schedule_review',
    access: 'write',
    async execute(input, context, signal) {
      if (!isRecord(input)) invalid()
      if (input.result !== 'remembered' && input.result !== 'forgotten') invalid()
      signal?.throwIfAborted()
      return service.recordReview(context.actor, {
        bookId: bookId(context),
        blockId: scopedBlockId(input.blockId ?? context.refs.blockId, context),
        result: input.result,
        signal,
      })
    },
  }]
}

export function registerLearningEvidenceTools(
  registry: ToolRegistry,
  service: LearningEvidenceService,
  dependencies: LearningEvidenceToolDependencies = {},
): void {
  for (const tool of createLearningEvidenceTools(service, dependencies)) registry.register(tool)
}
