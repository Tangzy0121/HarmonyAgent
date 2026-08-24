import { http } from '@kit.NetworkKit'
import { DataMode, ServerConfig } from '../../network/ServerConfig'
import { AgentEventByteStream } from './AgentEventByteStream'
import { AgentEventListener, AgentRuntimeGateway, AgentTurnRequest } from './AgentRuntimeGateway'

interface TurnRefsPayload {
  bookId?: string
  chapterId?: string
  blockId?: string
}

interface StartTurnPayload {
  version: string
  message: string
  surface: string
  refs: TurnRefsPayload
  capabilityHint: string
}

interface AnswerPayload {
  questionId: string
  answer: string
  idempotencyKey: string
}

function startPayload(request: AgentTurnRequest): StartTurnPayload {
  const refs: TurnRefsPayload = {}
  if (request.bookId.length > 0) refs.bookId = request.bookId
  if (request.chapterId.length > 0) refs.chapterId = request.chapterId
  if (request.blockId.length > 0) refs.blockId = request.blockId
  return { version: '1', message: request.message, surface: request.surface,
    refs, capabilityHint: request.surface === 'learning' ? 'guided_learning' : 'free_chat' }
}

export class HttpAgentRuntimeGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.HTTP
  private activeRequest: http.HttpRequest | null = null

  private async stream(path: string, method: http.RequestMethod, body: string,
    lastEventId: string, listener: AgentEventListener): Promise<void> {
    const request: http.HttpRequest = http.createHttp()
    this.activeRequest = request
    let callbackError: Error | null = null
    const stream = new AgentEventByteStream(listener, (): void => {
      if (callbackError !== null) return
      callbackError = new Error('invalid_agent_event')
      request.destroy()
    })
    request.on('dataReceive', (data: ArrayBuffer): void => {
      stream.push(new Uint8Array(data))
    })
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      }
      if (lastEventId.length > 0) headers['Last-Event-ID'] = lastEventId
      const options: http.HttpRequestOptions = {
        method,
        header: headers,
        connectTimeout: ServerConfig.TIMEOUT_MS,
        readTimeout: 120000,
        usingCache: false
      }
      if (body.length > 0) options.extraData = body
      const responseCode: number = await request.requestInStream(ServerConfig.BASE_URL + path, options)
      if (callbackError !== null) throw new Error((callbackError as Error).message)
      stream.finish()
      if (stream.hasFailed()) throw new Error('invalid_agent_event')
      if (responseCode < 200 || responseCode >= 300) throw new Error('agent_http_error')
    } catch (error) {
      throw new Error('agent_connection_failed')
    } finally {
      if (this.activeRequest === request) this.activeRequest = null
      request.off('dataReceive')
      request.destroy()
    }
  }

  start(request: AgentTurnRequest, listener: AgentEventListener): Promise<void> {
    return this.stream('/api/agent/turns', http.RequestMethod.POST,
      JSON.stringify(startPayload(request)), '', listener)
  }

  reconnect(turnId: string, lastEventId: string, listener: AgentEventListener): Promise<void> {
    return this.stream('/api/agent/turns/' + encodeURIComponent(turnId) + '/events',
      http.RequestMethod.GET, '', lastEventId, listener)
  }

  answer(turnId: string, questionId: string, answer: string,
    listener: AgentEventListener): Promise<void> {
    const payload: AnswerPayload = { questionId, answer,
      idempotencyKey: `${turnId}:answer:${questionId}` }
    return this.stream('/api/agent/turns/' + encodeURIComponent(turnId) + '/answers',
      http.RequestMethod.POST, JSON.stringify(payload), '', listener)
  }

  async cancel(turnId: string): Promise<void> {
    if (this.activeRequest !== null) this.activeRequest.destroy()
    if (turnId.length === 0) return
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
        ServerConfig.BASE_URL + '/api/agent/turns/' + encodeURIComponent(turnId) + '/cancel', options)
      if (response.responseCode < 200 || response.responseCode >= 300) {
        throw new Error('agent_cancel_failed')
      }
    } catch (error) {
      throw new Error('agent_cancel_failed')
    } finally {
      request.destroy()
    }
  }
}
