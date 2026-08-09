import { describe, expect, it } from 'vitest'

import {
  BookAgentValidationError,
  normalizeBookAgentRequest,
} from '../src/agent/bookAgentContract.js'

type RequestOverrides = {
  historyCount?: number
  sourceCount?: number
}

function makeRequest({ historyCount = 8, sourceCount = 21 }: RequestOverrides = {}) {
  return {
    question: '  为什么有标签才算监督学习？\n请解释。  ',
    history: Array.from({ length: historyCount }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: ` 第 ${index + 1} 条消息 `,
    })),
    context: {
      bookId: 'book-1',
      title: ' 机器学习 ',
      scope: 'chapter',
      label: ' 第 1 章 ',
      focusBlockId: 'block-1',
      chapters: [
        {
          id: 'chapter-1',
          title: ' 监督学习 ',
          objective: ' 理解标签 ',
          blocks: [
            {
              id: 'block-1',
              type: 'explanation',
              title: ' 标签 ',
              content: ' 标签   提供目标\n信号。 ',
              sourceIds: Array.from({ length: sourceCount }, (_, index) => `S${index + 1}`),
              userAuthored: false,
            },
          ],
        },
      ],
      sources: Array.from({ length: sourceCount }, (_, index) => ({
        id: `S${index + 1}`,
        sourceId: `source-${index + 1}`,
        fileName: ' 机器学习.pdf ',
        pageRange: `${index + 1}–${index + 2}`,
        excerpt: ` 第 ${index + 1} 条原文 `,
        chapterId: 'chapter-1',
        blockId: 'block-1',
      })),
      warnings: [' 一条提示 '],
    },
  }
}

function expectCode(run: () => unknown, code: string): void {
  try {
    run()
    throw new Error(`expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(BookAgentValidationError)
    expect((error as BookAgentValidationError).code).toBe(code)
    expect((error as Error).message).toBe(code)
  }
}

describe('normalizeBookAgentRequest', () => {
  it('rejects a missing or blank current question', () => {
    expectCode(() => normalizeBookAgentRequest({ question: '   ' }), 'question_required')
    expectCode(() => normalizeBookAgentRequest({}), 'question_required')
  })

  it('rejects questions beyond the public 2,000-character boundary', () => {
    const request = makeRequest()
    expectCode(
      () => normalizeBookAgentRequest({ ...request, question: '问'.repeat(2_001) }),
      'question_too_long',
    )
  })

  it('keeps the six most recent history messages and caps each at 4,000 characters', () => {
    const request = makeRequest()
    request.history[7].content = `  ${'答'.repeat(4_500)}  `

    const normalized = normalizeBookAgentRequest(request)

    expect(normalized.history).toHaveLength(6)
    expect(normalized.history[0]).toEqual({ role: 'user', content: '第 3 条消息' })
    expect(normalized.history.at(-1)?.content).toHaveLength(4_000)
  })

  it('rejects malformed history and does not disclose rejected content', () => {
    const secret = 'private-history-value'
    const request = makeRequest()
    request.history[0] = { role: 'system', content: secret }

    try {
      normalizeBookAgentRequest(request)
      throw new Error('expected invalid_history')
    } catch (error) {
      expect(error).toBeInstanceOf(BookAgentValidationError)
      expect((error as BookAgentValidationError).code).toBe('invalid_history')
      expect((error as Error).message).not.toContain(secret)
    }
  })

  it('normalizes whitespace and caps the numbered source inventory at 20', () => {
    const normalized = normalizeBookAgentRequest(makeRequest())

    expect(normalized.question).toBe('为什么有标签才算监督学习？ 请解释。')
    expect(normalized.context?.title).toBe('机器学习')
    expect(normalized.context?.chapters[0].blocks[0].content).toBe('标签 提供目标 信号。')
    expect(normalized.context?.sources).toHaveLength(20)
    expect(normalized.context?.sources.at(-1)?.id).toBe('S20')
  })

  it('rejects invalid scopes, duplicate IDs, and dangling block source references', () => {
    const badScope = makeRequest()
    badScope.context.scope = 'global'
    expectCode(() => normalizeBookAgentRequest(badScope), 'invalid_context')

    const duplicateSources = makeRequest({ sourceCount: 2 })
    duplicateSources.context.sources[1].id = 'S1'
    expectCode(() => normalizeBookAgentRequest(duplicateSources), 'invalid_context')

    const duplicateBlocks = makeRequest({ sourceCount: 1 })
    duplicateBlocks.context.chapters[0].blocks.push({
      ...duplicateBlocks.context.chapters[0].blocks[0],
    })
    expectCode(() => normalizeBookAgentRequest(duplicateBlocks), 'invalid_context')

    const danglingReference = makeRequest({ sourceCount: 1 })
    danglingReference.context.chapters[0].blocks[0].sourceIds = ['S99']
    expectCode(() => normalizeBookAgentRequest(danglingReference), 'invalid_context')
  })

  it('rejects crossed source owners and inventory sources not referenced by their owner block', () => {
    const crossedOwner = makeRequest({ sourceCount: 1 })
    crossedOwner.context.chapters.push({
      id: 'chapter-2',
      title: '无监督学习',
      objective: '理解聚类',
      blocks: [{
        ...crossedOwner.context.chapters[0].blocks[0],
        id: 'block-2',
      }],
    })
    crossedOwner.context.sources[0].chapterId = 'chapter-1'
    crossedOwner.context.sources[0].blockId = 'block-2'
    expectCode(() => normalizeBookAgentRequest(crossedOwner), 'invalid_context')

    const inventoryOnly = makeRequest({ sourceCount: 2 })
    inventoryOnly.context.chapters[0].blocks[0].sourceIds = ['S1']
    expectCode(() => normalizeBookAgentRequest(inventoryOnly), 'invalid_context')
  })

  it('rejects source references and source ownership on user-authored blocks', () => {
    const request = makeRequest({ sourceCount: 1 })
    request.context.chapters[0].blocks[0].userAuthored = true

    expectCode(() => normalizeBookAgentRequest(request), 'invalid_context')
  })

  it('rejects a focus block that is absent from the retained context', () => {
    const request = makeRequest({ sourceCount: 1 })
    request.context.focusBlockId = 'missing-block'

    expectCode(() => normalizeBookAgentRequest(request), 'invalid_context')
  })

  it('rejects more than eight chapters or more than 40 total blocks', () => {
    const tooManyChapters = makeRequest({ sourceCount: 1 })
    tooManyChapters.context.chapters = Array.from({ length: 9 }, (_, index) => ({
      ...tooManyChapters.context.chapters[0],
      id: `chapter-${index + 1}`,
      blocks: [],
    }))
    expectCode(() => normalizeBookAgentRequest(tooManyChapters), 'invalid_context')

    const tooManyBlocks = makeRequest({ sourceCount: 1 })
    tooManyBlocks.context.chapters[0].blocks = Array.from({ length: 41 }, (_, index) => ({
      ...tooManyBlocks.context.chapters[0].blocks[0],
      id: `block-${index + 1}`,
    }))
    expectCode(() => normalizeBookAgentRequest(tooManyBlocks), 'invalid_context')
  })

  it('rejects normalized context whose serialized form exceeds 24,000 characters', () => {
    const request = makeRequest({ sourceCount: 1 })
    request.context.chapters[0].blocks = Array.from({ length: 13 }, (_, index) => ({
      ...request.context.chapters[0].blocks[0],
      id: `block-${index + 1}`,
      content: '文'.repeat(2_000),
    }))

    expectCode(() => normalizeBookAgentRequest(request), 'context_too_large')
  })

  it('accepts an explicitly detached context', () => {
    const normalized = normalizeBookAgentRequest({
      question: '自由追问',
      history: [],
      context: null,
    })

    expect(normalized).toEqual({ question: '自由追问', history: [], context: null })
  })
})
