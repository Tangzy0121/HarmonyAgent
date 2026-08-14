import { describe, expect, it } from 'vitest'

import {
  CapabilityRegistry,
  createDefaultCapabilityRegistry,
} from './capabilityRegistry.js'
import type { LearningContext } from './learningContext.js'
import { ToolRegistry } from './toolRegistry.js'
import { askUserTool } from './tools/askUserTool.js'
import { readLearningStateTool } from './tools/readLearningStateTool.js'
import { readSourceTool } from './tools/readSourceTool.js'

function context(capabilityId: 'free_chat' | 'guided_learning'): LearningContext {
  return {
    actor: { userId: 'server-user', workspaceId: 'server-workspace' },
    surface: 'learning',
    capabilityId,
    refs: { bookId: 'book_one', chapterId: 'chapter-1' },
    authority: {},
    readScope: {
      bookId: 'book_one',
      chapterIds: ['chapter-1'],
      blockIds: [],
      sourceIds: ['source-1'],
    },
    learningStateSummary: { quizAttemptCount: 2, evidenceCount: 1, dueReviewCount: 0 },
    sources: [{
      sourceId: 'source-1',
      fileName: 'book.pdf',
      pageRange: '4-5',
      excerpt: '标签提供监督信号。',
    }],
    toolAllowlist: capabilityId === 'free_chat'
      ? ['read_source', 'read_learning_state']
      : [
          'read_source',
          'read_learning_state',
          'grade_quiz',
          'evaluate_feynman',
          'append_evidence',
          'schedule_review',
          'ask_user',
        ],
  }
}

describe('CapabilityRegistry', () => {
  it('mounts only read tools for free_chat even when write tools are registered', () => {
    const tools = new ToolRegistry()
    tools.register(readSourceTool)
    tools.register(readLearningStateTool)
    tools.register(askUserTool)
    tools.register({ id: 'append_evidence', access: 'write', execute: async () => ({}) })
    const capabilities = createDefaultCapabilityRegistry()

    expect(capabilities.mount('free_chat', context('free_chat'), tools).list())
      .toEqual(['read_source', 'read_learning_state'])
    expect(capabilities.mount('guided_learning', context('guided_learning'), tools).list())
      .toEqual(['read_source', 'read_learning_state', 'append_evidence', 'ask_user'])
  })

  it('provides real minimal tools for reading source/state and asking the user', async () => {
    const tools = new ToolRegistry()
    tools.register(readSourceTool)
    tools.register(readLearningStateTool)
    tools.register(askUserTool)
    const mounted = createDefaultCapabilityRegistry()
      .mount('guided_learning', context('guided_learning'), tools)

    await expect(mounted.invoke('read_source', { sourceId: 'source-1' })).resolves.toEqual({
      sourceId: 'source-1',
      fileName: 'book.pdf',
      pageRange: '4-5',
      excerpt: '标签提供监督信号。',
    })
    await expect(mounted.invoke('read_learning_state', {})).resolves.toEqual({
      quizAttemptCount: 2,
      evidenceCount: 1,
      dueReviewCount: 0,
    })
    await expect(mounted.invoke('ask_user', {
      prompt: '请选择章节',
      options: ['第一章'],
      allowFreeText: true,
    })).resolves.toEqual({
      prompt: '请选择章节',
      options: ['第一章'],
      allowFreeText: true,
    })
  })

  it('rejects unknown capability IDs without exposing arbitrary registered tools', () => {
    const registry = new CapabilityRegistry()
    expect(() => registry.get('arbitrary-capability')).toThrowError('capability_not_found')
  })
})
