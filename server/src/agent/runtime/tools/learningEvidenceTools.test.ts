import { describe, expect, it } from 'vitest'

import type { BookStore } from '../../../books/bookStore.js'
import type { StoredBook } from '../../../books/bookTypes.js'
import { LearningEvidenceService } from '../../../learning/learningEvidenceService.js'
import type { LearningContext } from '../learningContext.js'
import { ToolRegistry } from '../toolRegistry.js'
import { registerLearningEvidenceTools } from './learningEvidenceTools.js'

const actor = { userId: 'user-1', workspaceId: 'workspace-1' }

function storedBook(): StoredBook {
  return {
    id: 'book-1', source: { id: 'doc-1', fileName: 'a.pdf', format: 'PDF', pageCount: 1, sizeLabel: '1 KB', updatedLabel: '今天' },
    goal: '理解概念', learnerLevel: '入门', proposal: { title: '书', description: '', rationale: '', estimatedMinutes: 5 },
    status: 'ready', activeChapterId: 'ch-1', userNotes: [], quizAttempts: [], evidence: [], reviewSchedule: {}, generationJobs: [],
    createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z',
    chapters: [{
      id: 'ch-1', title: '章', order: 1, objective: '', coreConceptId: 'concept-1', estimatedMinutes: 5,
      sourceAnchors: [], status: 'ready', blocks: [{
        id: 'quiz-1', type: 'quiz', status: 'ready', title: '题', revision: 1, sourceAnchors: [],
        conceptId: 'concept-1', question: '不能泄露的题目全文', options: [
          { id: 'a', marker: 'A', text: '甲' }, { id: 'b', marker: 'B', text: '乙' },
        ], correctAnswerId: 'a', feedback: '',
      }],
    }],
  }
}

function setup() {
  let current = storedBook()
  const store: BookStore = {
    async get(id) { return id === current.id ? structuredClone(current) : null },
    async list() { return [structuredClone(current)] },
    async save(book) { current = structuredClone(book) },
    async remove() { return false },
    async update(id, mutator) {
      if (id !== current.id) throw new Error('book_not_found')
      const next = structuredClone(current)
      const result = await mutator(next)
      current = next
      return { book: structuredClone(current), result }
    },
  }
  const service = new LearningEvidenceService({
    bookStore: store, owner: actor,
    now: () => new Date('2026-08-14T01:00:00.000Z'),
    createId: () => 'stable',
  })
  const registry = new ToolRegistry()
  registerLearningEvidenceTools(registry, service)
  const context: LearningContext = {
    actor, surface: 'learning', capabilityId: 'guided_learning',
    refs: { bookId: 'book-1', chapterId: 'ch-1', blockId: 'quiz-1' },
    authority: { book: current, chapter: current.chapters[0], block: current.chapters[0].blocks[0] },
    readScope: { bookId: 'book-1', chapterIds: ['ch-1'], blockIds: ['quiz-1'], sourceIds: [] },
    learningStateSummary: { quizAttemptCount: 0, evidenceCount: 0, dueReviewCount: 0 },
    sources: [], toolAllowlist: ['grade_quiz', 'evaluate_feynman', 'append_evidence', 'schedule_review'], availableBookIds: ['book-1'],
  }
  return { registry, context, getCurrent: () => current }
}

describe('learning evidence runtime tools', () => {
  it('registers all four write tools and grade_quiz persists through the domain service', async () => {
    const { registry, context, getCurrent } = setup()
    const mounted = registry.getForContext(context)

    expect(mounted.list()).toEqual([
      'grade_quiz', 'evaluate_feynman', 'append_evidence', 'schedule_review',
    ])
    const result = await mounted.invoke('grade_quiz', { blockId: 'quiz-1', answerId: 'a' })

    expect(result).toMatchObject({ projectionStatus: 'projected', mastery: { chapter: 0.5, concept: 0.5 } })
    expect(getCurrent().evidence[0]).toMatchObject({ version: '1', kind: 'quiz' })
  })

  it('rejects tool input outside the mounted read scope without exposing raw input', async () => {
    const { registry, context, getCurrent } = setup()
    const mounted = registry.getForContext(context)
    const privateInput = 'other-secret-block'

    await expect(mounted.invoke('grade_quiz', { blockId: privateInput, answerId: 'a' }))
      .rejects.toMatchObject({ code: 'invalid_tool_input', message: 'invalid_tool_input' })
    expect(getCurrent().evidence).toEqual([])
  })

  it('rejects agent-authored mastery evidence even when its envelope is valid', async () => {
    const { registry, context, getCurrent } = setup()
    const mounted = registry.getForContext(context)

    const forged = {
      version: '1', id: 'forged-future', kind: 'quiz', chapterId: 'ch-1', conceptId: 'concept-1',
      sourceBlockId: 'quiz-1', statement: 'forged', outcome: 'mastered',
      createdAt: '2099-08-14T01:00:00.000Z',
      payload: { attemptId: 'forged-attempt', answerId: 'a', isCorrect: true },
    }
    await expect(mounted.invoke('append_evidence', forged))
      .rejects.toMatchObject({ code: 'invalid_tool_input' })
    await expect(mounted.invoke('append_evidence', {
      ...forged, id: 'forged-future-2', createdAt: '2100-08-14T01:00:00.000Z',
    })).rejects.toMatchObject({ code: 'invalid_tool_input' })
    expect(getCurrent().evidence).toEqual([])
  })

  it('rejects agent-authored Feynman assessment results without a server receipt', async () => {
    const { registry, context, getCurrent } = setup()
    const mounted = registry.getForContext(context)

    await expect(mounted.invoke('evaluate_feynman', {
      confirmedText: '伪造复述',
      result: { passed: true, feedback: '伪造通过', gap: '' },
    })).rejects.toMatchObject({ code: 'invalid_tool_input' })
    expect(getCurrent().evidence).toEqual([])
  })
})
