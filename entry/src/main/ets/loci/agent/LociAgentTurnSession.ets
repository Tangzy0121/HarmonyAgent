/**
 * M5e:Chat 轮次会话状态机(自 agent/runtime/AgentTurnSession.ets 迁移改造,
 * 消费 loci/agent 独立类型;旧栈文件已删)。
 * 相位:idle → connecting → streaming ⇄ waitingUser → completed / error / cancelled。
 * 断线恢复:流 EOF 未收 settling 帧(user_question/turn_completed/turn_failed)时,
 * 以 Last-Event-ID(信封 eventId)重连一次,仍失败 → error(调用侧 toast + 可重发)。
 * 事件去重/顺序:eventId 单调递增才接受(重放会重发已收帧)。
 */
import {
  AgentTurnCitation,
  AgentTurnEvent,
  AgentTurnEventListener,
  AgentTurnQuestion,
  AgentTurnRequest,
  AgentTurnStream,
  LociAgentTurnClient
} from './LociAgentTurnClient'

export type AgentTurnPhase = 'idle' | 'connecting' | 'streaming' | 'waitingUser' |
  'completed' | 'error' | 'cancelled'
export type AgentTurnObserver = () => void

/** settling 帧:收到即本轮流结束(server 发完主动关流)。 */
function isSettling(type: string): boolean {
  return type === 'user_question' || type === 'turn_completed' || type === 'turn_failed'
}

export class LociAgentTurnSession {
  private client: LociAgentTurnClient
  private observer: AgentTurnObserver = (): void => {}
  private streamHandle: AgentTurnStream | null = null
  private cancelRequested: boolean = false
  private lastRequest: AgentTurnRequest | null = null
  private generation: number = 0
  private reconnectUsed: boolean = false
  phase: AgentTurnPhase = 'idle'
  turnId: string = ''
  lastEventId: string = '0'
  bodyText: string = ''
  citations: Array<AgentTurnCitation> = []
  activities: Array<string> = []
  pendingQuestion: AgentTurnQuestion | null = null
  errorMessage: string = ''

  constructor(client: LociAgentTurnClient) {
    this.client = client
  }

  observe(observer: AgentTurnObserver): void {
    this.observer = observer
  }

  private changed(): void {
    this.observer()
  }

  private active(): boolean {
    return this.phase === 'connecting' || this.phase === 'streaming'
  }

  /** 进行中的轮(含等用户回答)不允许再开新轮。 */
  hasOpenTurn(): boolean {
    return this.active() || this.phase === 'waitingUser'
  }

  private current(generation: number): boolean {
    return generation === this.generation
  }

  private reset(request: AgentTurnRequest): void {
    this.lastRequest = request
    this.cancelRequested = false
    this.reconnectUsed = false
    this.phase = 'connecting'
    this.turnId = ''
    this.lastEventId = '0'
    this.bodyText = ''
    this.citations = []
    this.activities = []
    this.pendingQuestion = null
    this.errorMessage = ''
    this.changed()
  }

  private fail(message: string): void {
    if (this.cancelRequested) {
      return
    }
    this.phase = 'error'
    this.errorMessage = message
    this.changed()
  }

  private replaceStream(next: AgentTurnStream | null): void {
    const old: AgentTurnStream | null = this.streamHandle
    this.streamHandle = next
    if (old !== null && old !== next) {
      old.cancel()
    }
  }

  /**
   * 订阅一轮流;EOF/网络错误未收 settling 帧(user_question/turn_completed/turn_failed)
   * 且未重连过 → Last-Event-ID(信封 eventId)重连一次,仍失败/仍无终态 → error。
   */
  private async runStream(generation: number, stream: AgentTurnStream): Promise<void> {
    this.replaceStream(stream)
    let streamError: string = ''
    try {
      await stream.done
    } catch (error) {
      streamError = error instanceof Error ? error.message : '连接学习助手失败,请重试。'
      console.warn(`[loci] turn stream error: ${streamError}`)
    }
    console.info(`[loci] turn stream done: phase=${this.phase} lastEventId=${this.lastEventId} err=${streamError}`)
    if (!this.current(generation) || this.cancelRequested || !this.active()) {
      return // settling 帧已落地相位(waitingUser/completed/error),或已被取消/换代
    }
    // 无终态结束:120s 订阅上限/断线;已开轮则 Last-Event-ID 重连一次
    if (!this.reconnectUsed && this.turnId.length > 0) {
      this.reconnectUsed = true
      const resumed: AgentTurnStream = this.client.reconnect(this.turnId, this.lastEventId,
        (event: AgentTurnEvent): void => this.acceptCurrent(generation, event))
      await this.runStream(generation, resumed)
      return
    }
    this.fail(streamError.length > 0 ? streamError : '连接学习助手中断,请重试。')
  }

  private acceptCurrent(generation: number, event: AgentTurnEvent): void {
    if (this.current(generation)) {
      this.accept(event)
    }
  }

  /** 开一轮(发消息);进行中轮次直接忽略(UI 侧已禁用发送,双保险)。 */
  start(request: AgentTurnRequest): void {
    if (this.hasOpenTurn()) {
      return
    }
    const generation: number = this.generation + 1
    this.generation = generation
    this.reset(request)
    const stream: AgentTurnStream = this.client.startTurn(request,
      (event: AgentTurnEvent): void => this.acceptCurrent(generation, event))
    this.runStream(generation, stream)
      .catch((): void => {
        // runStream 内部已归一化相位;兜底防未处理拒绝
      })
  }

  /** error 相位重发上一条消息。 */
  retry(): void {
    if (this.phase === 'error' && this.lastRequest !== null) {
      this.start(this.lastRequest)
    }
  }

  accept(event: AgentTurnEvent): void {
    console.info(`[loci] turn event: ${event.type}#${event.eventId} turn=${event.turnId}`)
    if (this.cancelRequested) {
      return
    }
    if (this.turnId.length > 0 && event.turnId !== this.turnId) {
      return // 串轮防御:只收本轮帧
    }
    const nextId: number = Number(event.eventId)
    if (!Number.isSafeInteger(nextId) || nextId <= Number(this.lastEventId)) {
      return // 重放/乱序帧去重
    }
    this.turnId = event.turnId
    this.lastEventId = event.eventId
    if (event.type === 'turn_started') {
      this.phase = 'streaming'
    } else if (event.type === 'activity') {
      this.phase = 'streaming'
      if (event.activityLabel.length > 0) {
        this.activities.push(event.activityLabel)
      }
    } else if (event.type === 'content_delta') {
      this.phase = 'streaming'
      this.bodyText += event.text
    } else if (event.type === 'citation' && event.citation !== null) {
      this.citations.push(event.citation)
    } else if (event.type === 'user_question' && event.question !== null) {
      this.pendingQuestion = event.question
      this.phase = 'waitingUser'
    } else if (event.type === 'evidence_recorded') {
      // 证据落盘帧:Chat 暂无对应 UI,仅推进游标
    } else if (event.type === 'turn_completed') {
      this.pendingQuestion = null
      this.phase = 'completed'
    } else if (event.type === 'turn_failed') {
      this.pendingQuestion = null
      if (event.errorCode === 'cancelled') {
        this.phase = 'cancelled'
      } else {
        this.phase = 'error'
        this.errorMessage = event.errorMessage.length > 0
          ? event.errorMessage : '学习助手生成失败,请重试。'
      }
    }
    this.changed()
  }

  /** 回答 user_question;恢复流复用 runStream(同一次重连额度内)。 */
  answer(answerText: string): void {
    const question: AgentTurnQuestion | null = this.pendingQuestion
    if (question === null || answerText.trim().length === 0) {
      return
    }
    const generation: number = this.generation
    this.pendingQuestion = null
    this.phase = 'connecting'
    this.changed()
    const stream: AgentTurnStream = this.client.answer(this.turnId, question.questionId,
      answerText.trim(), (event: AgentTurnEvent): void => this.acceptCurrent(generation, event))
    this.runStream(generation, stream)
      .then((): void => {
        // 回答失败(流错误已进入 error):恢复问题卡片让用户在本轮重试
        if (this.current(generation) && this.phase === 'error' && !this.cancelRequested) {
          this.pendingQuestion = question
          this.phase = 'waitingUser'
          this.errorMessage = '回答发送失败,请重试。'
          this.changed()
        }
      })
      .catch((): void => {})
  }

  /** 关闭面板/退页:断流 + 调 cancel 端点(静默失败)。 */
  async cancel(): Promise<void> {
    this.cancelRequested = true
    const activeTurnId: string = this.turnId
    this.generation += 1
    this.replaceStream(null)
    this.phase = 'cancelled'
    this.pendingQuestion = null
    this.changed()
    try {
      await this.client.cancelTurn(activeTurnId)
    } catch (error) {
      // 取消失败不影响本地相位
    }
  }
}
