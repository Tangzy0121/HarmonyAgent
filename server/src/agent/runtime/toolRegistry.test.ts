import { describe, expect, it } from 'vitest'

import type { LearningContext } from './learningContext.js'
import { ToolRegistry, ToolRegistryError } from './toolRegistry.js'

function context(toolAllowlist: string[]): LearningContext {
  return {
    actor: { userId: 'server-user', workspaceId: 'server-workspace' },
    surface: 'agent',
    capabilityId: 'free_chat',
    refs: {},
    authority: {},
    readScope: { chapterIds: [], blockIds: [], sourceIds: [] },
    learningStateSummary: { quizAttemptCount: 0, evidenceCount: 0, dueReviewCount: 0 },
    sources: [],
    toolAllowlist,
  }
}

describe('ToolRegistry', () => {
  it('denies every tool by default and exposes only tools mounted for the context', async () => {
    const registry = new ToolRegistry()
    registry.register({
      id: 'read_source',
      access: 'read',
      execute: async () => ({ excerpt: 'safe' }),
    })
    registry.register({
      id: 'append_evidence',
      access: 'write',
      execute: async () => ({ evidenceId: 'evidence-1' }),
    })

    const denied = registry.getForContext(context([]))
    expect(denied.list()).toEqual([])
    await expect(denied.invoke('read_source', {}))
      .rejects.toBeInstanceOf(ToolRegistryError)

    const mounted = registry.getForContext(context(['read_source']))
    expect(mounted.list()).toEqual(['read_source'])
    await expect(mounted.invoke('read_source', {})).resolves.toEqual({ excerpt: 'safe' })
    await expect(mounted.invoke('append_evidence', { private: 'raw tool args' }))
      .rejects.toMatchObject({ code: 'tool_not_allowed', message: 'tool_not_allowed' })
  })

  it('rejects duplicate registrations', () => {
    const registry = new ToolRegistry()
    registry.register({ id: 'read_source', access: 'read', execute: async () => ({}) })

    expect(() => registry.register({
      id: 'read_source',
      access: 'read',
      execute: async () => ({}),
    })).toThrowError('tool_already_registered')
  })
})
