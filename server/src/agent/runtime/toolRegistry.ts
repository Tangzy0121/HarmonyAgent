import type { LearningContext } from './learningContext.js'

export type ToolId =
  | 'read_source'
  | 'read_learning_state'
  | 'ask_user'
  | 'grade_quiz'
  | 'evaluate_feynman'
  | 'append_evidence'
  | 'schedule_review'

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  id: ToolId
  access: 'read' | 'write'
  execute(input: TInput, context: LearningContext, signal?: AbortSignal): Promise<TOutput>
}

export type ToolRegistryErrorCode =
  | 'tool_already_registered'
  | 'tool_not_allowed'

export class ToolRegistryError extends Error {
  readonly code: ToolRegistryErrorCode

  constructor(code: ToolRegistryErrorCode) {
    super(code)
    this.name = 'ToolRegistryError'
    this.code = code
  }
}

export class MountedToolRegistry {
  private readonly tools: ReadonlyMap<ToolId, ToolDefinition>
  private readonly context: LearningContext

  constructor(tools: ReadonlyMap<ToolId, ToolDefinition>, context: LearningContext) {
    this.tools = tools
    this.context = context
  }

  list(): ToolId[] {
    return [...this.tools.keys()]
  }

  get(id: string): ToolDefinition {
    const tool = this.tools.get(id as ToolId)
    if (!tool) throw new ToolRegistryError('tool_not_allowed')
    return tool
  }

  async invoke(id: string, input: unknown, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted()
    return this.get(id).execute(input, this.context, signal)
  }
}

export class ToolRegistry {
  private readonly tools = new Map<ToolId, ToolDefinition>()

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) throw new ToolRegistryError('tool_already_registered')
    this.tools.set(tool.id, tool)
  }

  getForContext(
    context: LearningContext,
    requestedIds: readonly ToolId[] = context.toolAllowlist,
  ): MountedToolRegistry {
    const allowed = new Set(context.toolAllowlist)
    const mounted = new Map<ToolId, ToolDefinition>()
    for (const id of requestedIds) {
      if (!allowed.has(id)) continue
      const tool = this.tools.get(id)
      if (tool) mounted.set(id, tool)
    }
    return new MountedToolRegistry(mounted, context)
  }
}
