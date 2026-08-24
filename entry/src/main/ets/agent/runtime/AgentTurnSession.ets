import { DataMode } from '../../network/ServerConfig'
import { AgentCitation, AgentEventEnvelopeV1, AgentQuestion } from './AgentEventParser'
import { AgentEventListener, AgentRuntimeGateway, AgentTurnRequest } from './AgentRuntimeGateway'

export type AgentTurnPhase = 'idle' | 'connecting' | 'streaming' | 'waitingUser' |
  'completed' | 'error' | 'cancelled'
export type AgentSessionObserver = () => void

export class AgentTurnSession {
  private gateway: AgentRuntimeGateway
  private observer: AgentSessionObserver = (): void => {}
  private cancelRequested: boolean = false
  private lastRequest: AgentTurnRequest | null = null
  private generation: number = 0
  phase: AgentTurnPhase = 'idle'
  turnId: string = ''
  lastEventId: string = '0'
  bodyText: string = ''
  citations: Array<AgentCitation> = []
  activities: Array<string> = []
  pendingQuestion: AgentQuestion | null = null
  evidenceId: string = ''
  projectionStatus: string = ''
  errorMessage: string = ''

  constructor(gateway: AgentRuntimeGateway) {
    this.gateway = gateway
  }

  get dataModeLabel(): string {
    return this.gateway.mode === DataMode.HTTP ? 'HTTP 服务' : 'FIXTURE 演示数据'
  }

  observe(observer: AgentSessionObserver): void {
    this.observer = observer
  }

  private changed(): void {
    this.observer()
  }

  private active(): boolean {
    return this.phase === 'connecting' || this.phase === 'streaming'
  }

  private hasOpenTurn(): boolean {
    return this.active() || this.phase === 'waitingUser'
  }

  private current(generation: number): boolean {
    return generation === this.generation
  }

  private shouldRestoreQuestion(cursor: string): boolean {
    return this.phase === 'error' && this.lastEventId === cursor && !this.cancelRequested
  }

  private reset(request: AgentTurnRequest): void {
    this.lastRequest = request
    this.cancelRequested = false
    this.phase = 'connecting'
    this.turnId = ''
    this.lastEventId = '0'
    this.bodyText = ''
    this.citations = []
    this.activities = []
    this.pendingQuestion = null
    this.evidenceId = ''
    this.projectionStatus = ''
    this.errorMessage = ''
    this.changed()
  }

  private fail(): void {
    if (this.cancelRequested) return
    this.phase = 'error'
    this.errorMessage = '连接学习助手失败，请重试。'
    this.changed()
  }

  private acceptCurrent(generation: number, event: AgentEventEnvelopeV1): void {
    if (this.current(generation)) this.accept(event)
  }

  private async recover(generation: number): Promise<void> {
    if (!this.current(generation) || this.cancelRequested || this.turnId.length === 0 || !this.active()) return
    let attempts: number = 0
    while (this.current(generation) && !this.cancelRequested && this.active() && attempts < 3) {
      attempts += 1
      try {
        await this.gateway.reconnect(this.turnId, this.lastEventId,
          (event: AgentEventEnvelopeV1): void => this.acceptCurrent(generation, event))
      } catch (error) {
        if (this.current(generation) && attempts >= 3) this.fail()
      }
    }
    if (this.current(generation) && this.active()) this.fail()
  }

  async start(request: AgentTurnRequest): Promise<void> {
    if (this.hasOpenTurn()) return
    const generation: number = this.generation + 1
    this.generation = generation
    this.reset(request)
    try {
      await this.gateway.start(request,
        (event: AgentEventEnvelopeV1): void => this.acceptCurrent(generation, event))
      if (!this.current(generation)) return
      await this.recover(generation)
      if (this.current(generation) && this.active()) this.fail()
    } catch (error) {
      if (!this.current(generation)) return
      if (this.turnId.length > 0 && !this.cancelRequested) await this.recover(generation)
      else this.fail()
    }
  }

  async retry(): Promise<void> {
    if (this.lastRequest !== null) await this.start(this.lastRequest)
  }

  accept(event: AgentEventEnvelopeV1): void {
    if (this.cancelRequested) return
    if (this.turnId.length > 0 && event.turnId !== this.turnId) {
      this.fail()
      return
    }
    const nextId: number = Number(event.eventId)
    if (!Number.isSafeInteger(nextId) || nextId <= Number(this.lastEventId)) return
    if (nextId > Number(this.lastEventId) + 1) return
    this.turnId = event.turnId
    this.lastEventId = event.eventId
    if (event.type === 'turn_started') {
      this.phase = 'streaming'
    } else if (event.type === 'activity') {
      this.phase = 'streaming'
      this.activities.push(event.activityLabel)
    } else if (event.type === 'content_delta') {
      this.phase = 'streaming'
      this.bodyText += event.text
    } else if (event.type === 'citation' && event.citation !== null) {
      this.citations.push(event.citation)
    } else if (event.type === 'user_question' && event.question !== null) {
      this.pendingQuestion = event.question
      this.phase = 'waitingUser'
    } else if (event.type === 'evidence_recorded') {
      this.evidenceId = event.evidenceId
      this.projectionStatus = event.projectionStatus
    } else if (event.type === 'turn_completed') {
      this.pendingQuestion = null
      this.phase = 'completed'
    } else if (event.type === 'turn_failed') {
      this.pendingQuestion = null
      if (event.errorCode === 'cancelled') {
        this.phase = 'cancelled'
      } else {
        this.phase = 'error'
        this.errorMessage = event.errorMessage.length > 0 ? event.errorMessage : '学习助手生成失败，请重试。'
      }
    }
    this.changed()
  }

  async answer(answer: string): Promise<void> {
    if (this.pendingQuestion === null || answer.trim().length === 0) return
    const question: AgentQuestion = this.pendingQuestion
    const questionId: string = question.questionId
    const cursorBeforeAnswer: string = this.lastEventId
    const generation: number = this.generation
    this.pendingQuestion = null
    this.phase = 'connecting'
    this.changed()
    try {
      await this.gateway.answer(this.turnId, questionId, answer.trim(),
        (event: AgentEventEnvelopeV1): void => this.acceptCurrent(generation, event))
      if (!this.current(generation)) return
      await this.recover(generation)
      if (this.current(generation) && this.shouldRestoreQuestion(cursorBeforeAnswer)) {
        this.pendingQuestion = question
        this.phase = 'waitingUser'
        this.errorMessage = '回答发送失败，请在本轮重试。'
        this.changed()
      }
    } catch (error) {
      if (!this.current(generation)) return
      await this.recover(generation)
      if (this.current(generation) && this.shouldRestoreQuestion(cursorBeforeAnswer)) {
        this.pendingQuestion = question
        this.phase = 'waitingUser'
        this.errorMessage = '回答发送失败，请在本轮重试。'
        this.changed()
      }
    }
  }

  async cancel(): Promise<void> {
    this.cancelRequested = true
    const activeTurnId: string = this.turnId
    this.generation += 1
    this.phase = 'cancelled'
    this.pendingQuestion = null
    this.changed()
    try {
      await this.gateway.cancel(activeTurnId)
    } catch (error) {
    }
  }
}
