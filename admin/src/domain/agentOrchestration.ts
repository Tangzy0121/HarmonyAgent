import type { AgentContextScope } from '../types/learningBook'

export type AgentIntent = 'generate_book' | 'submit_validation' | 'ask_question' | 'project_map'

export type AgentWorkflow =
  | 'learning_book_generation'
  | 'deep_learning_validation'
  | 'free_qa'
  | 'deterministic_projection'

type AgentService =
  | 'document_parser'
  | 'rag_retrieval'
  | 'book_store'
  | 'quiz_engine'
  | 'evidence_store'
  | 'conversation_store'
  | 'concept_graph'
  | 'learning_state_projector'

export interface AgentRequest {
  intent: AgentIntent
  bookId: string
  chapterId: string
  contextScope: AgentContextScope
}

export interface AgentExecutionPlan {
  workflow: AgentWorkflow
  contextScope: AgentContextScope
  services: AgentService[]
  mayWriteLearningEvidence: boolean
  agentVisible: boolean
}

const workflowByIntent: Record<AgentIntent, Omit<AgentExecutionPlan, 'contextScope'>> = {
  generate_book: {
    workflow: 'learning_book_generation',
    services: ['document_parser', 'rag_retrieval', 'book_store'],
    mayWriteLearningEvidence: false,
    agentVisible: true,
  },
  submit_validation: {
    workflow: 'deep_learning_validation',
    services: ['rag_retrieval', 'quiz_engine', 'evidence_store'],
    mayWriteLearningEvidence: true,
    agentVisible: true,
  },
  ask_question: {
    workflow: 'free_qa',
    services: ['rag_retrieval', 'conversation_store'],
    mayWriteLearningEvidence: false,
    agentVisible: true,
  },
  project_map: {
    workflow: 'deterministic_projection',
    services: ['concept_graph', 'learning_state_projector'],
    mayWriteLearningEvidence: false,
    agentVisible: false,
  },
}

export function orchestrateAgentRequest(request: AgentRequest): AgentExecutionPlan {
  return {
    ...workflowByIntent[request.intent],
    contextScope: request.contextScope,
  }
}
