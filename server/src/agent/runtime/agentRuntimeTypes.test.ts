import { describe, expect, it } from 'vitest'

import {
  AgentRuntimeValidationError,
  normalizeStartTurnRequest,
} from './agentRuntimeTypes.js'

function validRequest(): Record<string, unknown> {
  return {
    version: '1',
    message: '  请解释监督学习。  ',
    surface: 'learning',
    refs: {
      bookId: 'book_1',
      chapterId: 'chapter-1',
      blockId: 'block-1',
    },
    capabilityHint: 'guided_learning',
  }
}

describe('normalizeStartTurnRequest', () => {
  it.each([
    [{ ...validRequest(), version: '2' }, 'unsupported_version'],
    [{ ...validRequest(), message: ' \n ' }, 'message_required'],
    [{ ...validRequest(), surface: 'settings' }, 'invalid_surface'],
    [{ ...validRequest(), refs: { chapterId: 'chapter-1' } }, 'invalid_refs'],
    [{ ...validRequest(), refs: { bookId: 'book_1', blockId: 'block-1' } }, 'invalid_refs'],
  ])('rejects invalid public input with the stable code %s', (input, expectedCode) => {
    let caught: unknown
    try {
      normalizeStartTurnRequest(input)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AgentRuntimeValidationError)
    expect((caught as AgentRuntimeValidationError).code).toBe(expectedCode)
    expect(String((caught as Error).message)).not.toContain('请解释监督学习')
  })

  it('normalizes known fields and drops actor and unknown client fields', () => {
    const normalized = normalizeStartTurnRequest({
      ...validRequest(),
      userId: 'client-chosen-user',
      workspaceId: 'client-chosen-workspace',
      hiddenPrompt: 'leak-me',
      refs: {
        ...(validRequest().refs as object),
        unknownRef: 'ignored',
      },
    })

    expect(normalized).toEqual({
      version: '1',
      message: '请解释监督学习。',
      surface: 'learning',
      refs: {
        bookId: 'book_1',
        chapterId: 'chapter-1',
        blockId: 'block-1',
      },
      capabilityHint: 'guided_learning',
    })
    expect(normalized).not.toHaveProperty('userId')
    expect(normalized).not.toHaveProperty('workspaceId')
  })
})
