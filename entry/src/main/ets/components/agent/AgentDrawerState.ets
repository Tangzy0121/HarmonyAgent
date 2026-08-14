import { AgentCitation, AgentQuestion } from '../../agent/runtime/AgentEventParser'
import { AgentTurnPhase } from '../../agent/runtime/AgentTurnSession'

export class AgentDrawerState {
  bodyText: string
  citations: Array<AgentCitation>
  activityLabel: string
  question: AgentQuestion | null
  errorMessage: string
  showRetry: boolean
  showCancel: boolean

  constructor(bodyText: string, citations: Array<AgentCitation>, activityLabel: string,
    question: AgentQuestion | null, errorMessage: string, showRetry: boolean, showCancel: boolean) {
    this.bodyText = bodyText
    this.citations = citations
    this.activityLabel = activityLabel
    this.question = question
    this.errorMessage = errorMessage
    this.showRetry = showRetry
    this.showCancel = showCancel
  }
}

export function agentCitationKey(citation: AgentCitation): string {
  return `${citation.sourceId}|${citation.fileName}|${citation.pageRange}`
}

export function agentOptionMinHeight(option: string): number {
  return option.length > 18 ? 64 : 44
}

export function buildAgentDrawerState(phase: AgentTurnPhase, bodyText: string,
  citations: Array<AgentCitation>, activities: Array<string>, question: AgentQuestion | null,
  errorMessage: string): AgentDrawerState {
  const activityLabel: string = activities.length > 0 ? activities[activities.length - 1] : ''
  const safeError: string = phase === 'error' ? '连接学习助手失败，请重试。' : errorMessage
  const active: boolean = phase === 'connecting' || phase === 'streaming' || phase === 'waitingUser'
  const visibleQuestion: AgentQuestion | null = phase === 'waitingUser' ? question : null
  return new AgentDrawerState(bodyText, citations, activityLabel, visibleQuestion, safeError,
    phase === 'error', active)
}
