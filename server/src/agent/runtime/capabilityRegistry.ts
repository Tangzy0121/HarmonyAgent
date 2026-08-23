import type { CapabilityId } from './agentRuntimeTypes.js'
import type { LearningContext } from './learningContext.js'
import type { MountedToolRegistry, ToolId, ToolRegistry } from './toolRegistry.js'

export interface CapabilityDefinition {
  id: CapabilityId
  toolIds: readonly ToolId[]
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<CapabilityId, CapabilityDefinition>()

  register(capability: CapabilityDefinition): void {
    if (this.capabilities.has(capability.id)) throw new Error('capability_already_registered')
    this.capabilities.set(capability.id, capability)
  }

  get(id: string): CapabilityDefinition {
    const capability = this.capabilities.get(id as CapabilityId)
    if (!capability) throw new Error('capability_not_found')
    return capability
  }

  mount(
    id: string,
    context: LearningContext,
    tools: ToolRegistry,
  ): MountedToolRegistry {
    return tools.getForContext(context, this.get(id).toolIds)
  }
}

export function createDefaultCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register({
    id: 'free_chat',
    toolIds: ['read_source', 'read_learning_state'],
  })
  registry.register({
    id: 'guided_learning',
    toolIds: [
      'read_source',
      'read_learning_state',
      'grade_quiz',
      'evaluate_feynman',
      'append_evidence',
      'schedule_review',
      'ask_user',
    ],
  })
  return registry
}
