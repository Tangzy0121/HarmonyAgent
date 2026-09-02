/**
 * M5e:agentTurns SSE 客户端(自 agent/runtime/HttpAgentRuntimeGateway.ets 迁移改造,
 * 类型独立、只依赖 ServerConfig;旧栈文件已删)。
 * 契约真源(只读,server 零改动):server/src/routes/agentTurns.ts
 *   + server/src/agent/runtime/agentRuntimeTypes.ts + agentEvent.ts。
 * - POST /api/agent/turns {version:'1',message(≤2000),surface,refs,capabilityHint?}
 *   → 立即 SSE;无 LLM key 时 200 流内 turn_failed{code:'agent_failed'}(2026-08-26 curl 实测)
 * - GET /api/agent/turns/:turnId/events(Last-Event-ID header 游标)→ 事件重放 + 续播
 * - POST /api/agent/turns/:turnId/answers {questionId,answer,idempotencyKey?} → 恢复 SSE
 * - POST /api/agent/turns/:turnId/cancel → {version,turnId,status:'cancelled'}
 * SSE 帧:`id: <eventId>` + `event: <type>` + `data: <信封 JSON>`;心跳 `: heartbeat`;
 * user_question/turn_completed/turn_failed 为 settling 帧(server 收到即发完关流);
 * 订阅 120s 上限,断线由会话层以 Last-Event-ID 重连(游标取信封 eventId,与 id 行一致)。
 * 非 2xx 错误体 {error:{version,code,message}}(与 books API 的扁平 {error:code} 不同,
 * 这里单独解析,message 直接做中文文案)。
 */
import { http } from '@kit.NetworkKit'
import { util } from '@kit.ArkTS'
import { ServerConfig } from '../../network/ServerConfig'

// ---- 请求模型 ----

/** 开轮请求;空串字段不放进 refs(server 校验:chapterId 需 bookId 前置,blockId 需 chapterId)。 */
export class AgentTurnRequest {
  message: string
  surface: string
  bookId: string
  chapterId: string
  blockId: string
  conceptId: string

  constructor(message: string, surface: string, bookId: string = '', chapterId: string = '',
    blockId: string = '', conceptId: string = '') {
    this.message = message
    this.surface = surface
    this.bookId = bookId
    this.chapterId = chapterId
    this.blockId = blockId
    this.conceptId = conceptId
  }
}

// ---- 事件模型(信封 payload 拍平,同旧栈 AgentEventParser 的字段语义) ----

export type AgentTurnEventType = 'turn_started' | 'activity' | 'content_delta' | 'citation' |
  'user_question' | 'evidence_recorded' | 'turn_completed' | 'turn_failed' | 'unknown'

export class AgentTurnCitation {
  /** 轮内别名(如 S1);documentSourceId 才是书内 sourceAnchors 的 sourceId。 */
  sourceId: string
  documentSourceId: string
  fileName: string
  pageRange: string

  constructor(sourceId: string, documentSourceId: string, fileName: string, pageRange: string) {
    this.sourceId = sourceId
    this.documentSourceId = documentSourceId
    this.fileName = fileName
    this.pageRange = pageRange
  }

  /** 引用 chips 过滤用:优先对齐项目 anchors 的真实 sourceId。 */
  get anchorCandidate(): string {
    return this.documentSourceId.length > 0 ? this.documentSourceId : this.sourceId
  }
}

export class AgentTurnQuestion {
  questionId: string
  prompt: string
  options: Array<string>
  allowFreeText: boolean

  constructor(questionId: string, prompt: string, options: Array<string>, allowFreeText: boolean) {
    this.questionId = questionId
    this.prompt = prompt
    this.options = options
    this.allowFreeText = allowFreeText
  }
}

export class AgentTurnEvent {
  turnId: string
  eventId: string
  type: AgentTurnEventType
  text: string = ''
  activityLabel: string = ''
  citation: AgentTurnCitation | null = null
  question: AgentTurnQuestion | null = null
  evidenceId: string = ''
  projectionStatus: string = ''
  errorCode: string = ''
  errorMessage: string = ''

  constructor(turnId: string, eventId: string, type: AgentTurnEventType) {
    this.turnId = turnId
    this.eventId = eventId
    this.type = type
  }
}

// ---- wire 类型 ----

interface WireCitationPayload {
  sourceId?: string
  documentSourceId?: string
  fileName?: string
  pageRange?: string
}

interface WireEventPayload {
  label?: string
  text?: string
  sourceId?: string
  documentSourceId?: string
  fileName?: string
  pageRange?: string
  questionId?: string
  prompt?: string
  options?: Array<string>
  allowFreeText?: boolean
  evidenceId?: string
  projectionStatus?: string
  code?: string
  message?: string
}

interface WireEventEnvelope {
  version: string
  turnId: string
  eventId: string
  timestamp: string
  idempotencyKey: string
  type: string
  payload: WireEventPayload
}

/** turns 错误信封 {error:{version,code,message}}。 */
interface WireTurnErrorBody {
  error?: WireTurnErrorDetail
}

interface WireTurnErrorDetail {
  version?: string
  code?: string
  message?: string
}

function knownType(value: string): AgentTurnEventType {
  switch (value) {
    case 'turn_started':
    case 'activity':
    case 'content_delta':
    case 'citation':
    case 'user_question':
    case 'evidence_recorded':
    case 'turn_completed':
    case 'turn_failed':
      return value
    default:
      return 'unknown'
  }
}

function optionalText(value: string | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 解析单帧 data JSON。校验宽松化:只挑消费字段,坏帧抛 Error 由流层跳过
 * (server 帧结构由 agentEvent.ts 保证,客户端不对全字段做强校验)。
 */
export function parseAgentTurnEvent(data: string): AgentTurnEvent {
  const wire: WireEventEnvelope = JSON.parse(data) as WireEventEnvelope
  if (typeof wire.turnId !== 'string' || wire.turnId.length === 0 ||
    typeof wire.eventId !== 'string' || wire.eventId.length === 0 ||
    typeof wire.type !== 'string' || wire.payload === null || typeof wire.payload !== 'object') {
    throw new Error('invalid_agent_event')
  }
  const type: AgentTurnEventType = knownType(wire.type)
  const event: AgentTurnEvent = new AgentTurnEvent(wire.turnId, wire.eventId, type)
  const payload: WireEventPayload = wire.payload
  if (type === 'content_delta') {
    event.text = optionalText(payload.text)
  } else if (type === 'activity') {
    event.activityLabel = optionalText(payload.label)
  } else if (type === 'citation') {
    event.citation = new AgentTurnCitation(optionalText(payload.sourceId),
      optionalText(payload.documentSourceId), optionalText(payload.fileName),
      optionalText(payload.pageRange))
  } else if (type === 'user_question') {
    const options: Array<string> = []
    if (Array.isArray(payload.options)) {
      payload.options.forEach((option: string): void => {
        if (typeof option === 'string' && option.length > 0) {
          options.push(option)
        }
      })
    }
    event.question = new AgentTurnQuestion(optionalText(payload.questionId),
      optionalText(payload.prompt), options, payload.allowFreeText === true)
  } else if (type === 'evidence_recorded') {
    event.evidenceId = optionalText(payload.evidenceId)
    event.projectionStatus = optionalText(payload.projectionStatus)
  } else if (type === 'turn_failed') {
    event.errorCode = optionalText(payload.code)
    event.errorMessage = optionalText(payload.message)
  }
  return event
}

/** turns 错误信封 → 中文文案 Error(message 直接可用;缺省回退 HTTP 状态)。 */
function normalizeTurnError(status: number, body: string): Error {
  try {
    const parsed: WireTurnErrorBody = JSON.parse(body) as WireTurnErrorBody
    const message: string = parsed.error?.message ?? ''
    if (message.length > 0) {
      return new Error(message)
    }
  } catch (e) {
    // 非 JSON 错误体落到状态文案
  }
  return new Error(`学习助手请求失败(HTTP ${status})`)
}

export type AgentTurnEventListener = (event: AgentTurnEvent) => void

/** 一次 SSE 订阅句柄;cancel() 只断底层连接,不调 cancel 端点(语义取消走 cancelTurn)。 */
export interface AgentTurnStream {
  done: Promise<void>
  cancel: () => void
}

interface TurnRefsPayload {
  bookId?: string
  chapterId?: string
  blockId?: string
  conceptId?: string
}

interface StartTurnPayload {
  version: string
  message: string
  surface: string
  refs: TurnRefsPayload
  capabilityHint: string
}

function startPayload(request: AgentTurnRequest): StartTurnPayload {
  const refs: TurnRefsPayload = {}
  if (request.bookId.length > 0) {
    refs.bookId = request.bookId
  }
  if (request.chapterId.length > 0) {
    refs.chapterId = request.chapterId
  }
  if (request.blockId.length > 0) {
    refs.blockId = request.blockId
  }
  if (request.conceptId.length > 0) {
    refs.conceptId = request.conceptId
  }
  return {
    version: '1',
    message: request.message,
    surface: request.surface,
    refs: refs,
    capabilityHint: request.surface === 'learning' ? 'guided_learning' : 'free_chat'
  }
}

/**
 * turns 帧解析器:在 M5c SseFrameParser 基础上多认 `id:` 行(忽略,
 * 游标以信封 eventId 为准);`event:`/`data:` 组帧,空行派发,心跳注释行忽略。
 */
class AgentSseFrameParser {
  private dataLines: string[] = []
  private dispatch: (data: string) => void

  constructor(dispatch: (data: string) => void) {
    this.dispatch = dispatch
  }

  pushLine(raw: string): void {
    const line: string = raw.endsWith('\r') ? raw.substring(0, raw.length - 1) : raw
    if (line.length === 0) {
      this.flushFrame()
      return
    }
    if (line.startsWith(':')) {
      return // 心跳
    }
    if (line.startsWith('data:')) {
      let value: string = line.substring(5)
      if (value.startsWith(' ')) {
        value = value.substring(1)
      }
      this.dataLines.push(value)
      return
    }
    // event:/id:/其他字段行:帧类型以信封 type 为准,均忽略
  }

  end(): void {
    this.flushFrame()
  }

  private flushFrame(): void {
    if (this.dataLines.length > 0) {
      this.dispatch(this.dataLines.join('\n'))
    }
    this.dataLines = []
  }
}

export class LociAgentTurnClient {
  /**
   * SSE 订阅公共路径(start/reconnect/answer 同构):字节级缓冲 + 行切分 + 组帧,
   * 写法对齐 LociApiClient.startChapterGeneration(M5c 实测过的跨 chunk/CRLF 处理)。
   * 流正常结束(含 server 120s 上限主动断)resolve;非 2xx reject normalizeTurnError;
   * 网络错误 reject。settling 判定与重连策略在会话层。
   */
  private stream(path: string, method: http.RequestMethod, body: string,
    lastEventId: string, listener: AgentTurnEventListener): AgentTurnStream {
    const request: http.HttpRequest = http.createHttp()
    let cancelled: boolean = false
    let pending: Uint8Array = new Uint8Array(0)
    let allBytes: Uint8Array = new Uint8Array(0)
    const decoder: util.TextDecoder = util.TextDecoder.create('utf-8')

    const parser: AgentSseFrameParser = new AgentSseFrameParser((data: string): void => {
      try {
        listener(parseAgentTurnEvent(data))
      } catch (e) {
        // 单帧损坏不阻断流,等后续帧或 EOF 由会话层判定
      }
    })

    const drain = (isFinal: boolean): void => {
      let cut: number = -1
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i] === 0x0A) {
          cut = i
          break
        }
      }
      if (cut < 0 && !isFinal) {
        return
      }
      const head: Uint8Array = cut < 0 ? pending : pending.subarray(0, cut + 1)
      pending = cut < 0 ? new Uint8Array(0) : pending.subarray(cut + 1)
      const text: string = decoder.decodeToString(head)
      const lines: string[] = text.split('\n')
      // split 末段是最后一个 \n 后的残余,head 以 \n 结尾时恒为 '',不是真实空行,丢弃
      if (lines.length > 0 && lines[lines.length - 1].length === 0) {
        lines.pop()
      }
      lines.forEach((line: string): void => parser.pushLine(line))
    }

    request.on('dataReceive', (data: ArrayBuffer): void => {
      const chunk: Uint8Array = new Uint8Array(data)
      const merged: Uint8Array = new Uint8Array(pending.length + chunk.length)
      merged.set(pending, 0)
      merged.set(chunk, pending.length)
      pending = merged
      const full: Uint8Array = new Uint8Array(allBytes.length + chunk.length)
      full.set(allBytes, 0)
      full.set(chunk, allBytes.length)
      allBytes = full
      drain(false)
    })

    const done: Promise<void> = (async (): Promise<void> => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'text/event-stream'
        }
        if (lastEventId.length > 0) {
          headers['Last-Event-ID'] = lastEventId
        }
        const options: http.HttpRequestOptions = {
          method,
          connectTimeout: ServerConfig.TIMEOUT_MS,
          // 订阅上限 120s + 15s 心跳保活,读超时放宽到 130s
          readTimeout: ServerConfig.AGENT_STREAM_TIMEOUT_MS,
          usingCache: false,
          header: headers
        }
        if (body.length > 0) {
          options.extraData = body
        }
        const responseCode: number =
          await request.requestInStream(ServerConfig.BASE_URL + path, options)
        if (cancelled) {
          return
        }
        drain(true)
        parser.end()
        if (responseCode < 200 || responseCode >= 300) {
          throw normalizeTurnError(responseCode, decoder.decodeToString(allBytes))
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        if (error instanceof Error) {
          throw error
        }
        throw new Error('网络连接失败,请检查网络后重试')
      } finally {
        request.off('dataReceive')
        request.destroy()
      }
    })()

    return {
      done: done,
      cancel: (): void => {
        cancelled = true
        try {
          request.destroy()
        } catch (e) {
          // 已销毁/未连接时忽略
        }
      }
    }
  }

  /** POST /api/agent/turns 开轮并立即订阅。 */
  startTurn(request: AgentTurnRequest, listener: AgentTurnEventListener): AgentTurnStream {
    return this.stream('/api/agent/turns', http.RequestMethod.POST,
      JSON.stringify(startPayload(request)), '', listener)
  }

  /** GET /api/agent/turns/:turnId/events,Last-Event-ID 游标重放续播。 */
  reconnect(turnId: string, lastEventId: string, listener: AgentTurnEventListener): AgentTurnStream {
    return this.stream('/api/agent/turns/' + encodeURIComponent(turnId) + '/events',
      http.RequestMethod.GET, '', lastEventId, listener)
  }

  /** POST /api/agent/turns/:turnId/answers 回答 user_question 并恢复 SSE。 */
  answer(turnId: string, questionId: string, answerText: string,
    listener: AgentTurnEventListener): AgentTurnStream {
    const body: string = JSON.stringify({
      questionId: questionId,
      answer: answerText,
      idempotencyKey: `${turnId}:answer:${questionId}`
    })
    return this.stream('/api/agent/turns/' + encodeURIComponent(turnId) + '/answers',
      http.RequestMethod.POST, body, '', listener)
  }

  /** POST /api/agent/turns/:turnId/cancel;turnId 空(还没开轮)直接返回。 */
  async cancelTurn(turnId: string): Promise<void> {
    if (turnId.length === 0) {
      return
    }
    const request: http.HttpRequest = http.createHttp()
    try {
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.POST,
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: ServerConfig.TIMEOUT_MS,
        readTimeout: ServerConfig.TIMEOUT_MS,
        usingCache: false,
        header: { 'Content-Type': 'application/json' },
        extraData: '{}'
      }
      const response: http.HttpResponse = await request.request(
        ServerConfig.BASE_URL + '/api/agent/turns/' + encodeURIComponent(turnId) + '/cancel',
        options)
      if (response.responseCode < 200 || response.responseCode >= 300) {
        const text: string = typeof response.result === 'string' ? response.result : ''
        throw normalizeTurnError(response.responseCode, text)
      }
    } finally {
      request.destroy()
    }
  }
}
