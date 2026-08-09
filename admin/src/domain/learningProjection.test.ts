import { describe, expect, it } from 'vitest'
import { knowledgeNodes } from '../data/learningMap'
import { learningBookFixture } from '../data/learningBook'
import { submitQuizAttempt } from './learningBook'
import { projectLearningEvidence } from './learningProjection'

describe('projectLearningEvidence', () => {
  it('projects correct quiz evidence onto the knowledge map without an Agent decision', () => {
    const book = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-b')
    const nodes = projectLearningEvidence(knowledgeNodes, book.evidence)

    expect(nodes.find((node) => node.id === 'supervised-learning')?.learningState).toBe('已掌握')
  })

  it('projects an incorrect quiz attempt as review work', () => {
    const book = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-a')
    const nodes = projectLearningEvidence(knowledgeNodes, book.evidence)

    expect(nodes.find((node) => node.id === 'supervised-learning')?.learningState).toBe('待复习')
  })
})
