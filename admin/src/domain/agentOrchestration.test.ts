import { describe, expect, it } from 'vitest'
import { orchestrateAgentRequest } from './agentOrchestration'

describe('orchestrateAgentRequest', () => {
  it('routes generation work to the learning-book workflow', () => {
    const result = orchestrateAgentRequest({
      intent: 'generate_book',
      bookId: 'book-ml-03',
      chapterId: 'ch-1',
      contextScope: 'chapter',
    })

    expect(result.workflow).toBe('learning_book_generation')
    expect(result.services).toEqual(['document_parser', 'rag_retrieval', 'book_store'])
    expect(result.mayWriteLearningEvidence).toBe(false)
  })

  it('lets validation create evidence through the deep-learning workflow', () => {
    const result = orchestrateAgentRequest({
      intent: 'submit_validation',
      bookId: 'book-ml-03',
      chapterId: 'ch-1',
      contextScope: 'chapter',
    })

    expect(result.workflow).toBe('deep_learning_validation')
    expect(result.services).toContain('evidence_store')
    expect(result.mayWriteLearningEvidence).toBe(true)
  })

  it('keeps free Q&A read-only even with whole-book context', () => {
    const result = orchestrateAgentRequest({
      intent: 'ask_question',
      bookId: 'book-ml-03',
      chapterId: 'ch-1',
      contextScope: 'book',
    })

    expect(result.workflow).toBe('free_qa')
    expect(result.contextScope).toBe('book')
    expect(result.mayWriteLearningEvidence).toBe(false)
  })

  it('treats map projection as a deterministic service instead of a fourth Agent', () => {
    const result = orchestrateAgentRequest({
      intent: 'project_map',
      bookId: 'book-ml-03',
      chapterId: 'ch-1',
      contextScope: 'chapter',
    })

    expect(result.workflow).toBe('deterministic_projection')
    expect(result.services).toEqual(['concept_graph', 'learning_state_projector'])
    expect(result.agentVisible).toBe(false)
  })
})
