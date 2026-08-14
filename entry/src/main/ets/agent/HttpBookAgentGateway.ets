import { util } from '@kit.ArkTS'
import { http } from '@kit.NetworkKit'
import { BookAgentGateway } from './BookAgentGateway'
import { BookAgentEvent } from './BookAgentModels'
import { SseFrame, SseFrameParser } from './SseFrameParser'
import { ServerConfig } from '../network/ServerConfig'

interface AgentBlockPayload {
  id: string
  type: string
  title: string
  content: string
  sourceIds: Array<string>
  userAuthored: boolean
}

interface AgentChapterPayload {
  id: string
  title: string
  objective: string
  blocks: Array<AgentBlockPayload>
}

interface AgentContextPayload {
  bookId: string
  title: string
  scope: string
  label: string
  chapters: Array<AgentChapterPayload>
  sources: Array<string>
  warnings: Array<string>
}

interface AgentRequestPayload {
  question: string
  history: Array<string>
  context: AgentContextPayload
}

interface DeltaPayload {
  text: string
}

interface ErrorPayload {
  code: string
  message: string
}

function requestPayload(question: string, contextText: string): AgentRequestPayload {
  const block: AgentBlockPayload = {
    id: 'arkui-context', type: 'context', title: '当前学习上下文', content: contextText,
    sourceIds: [], userAuthored: false
  }
  const chapter: AgentChapterPayload = {
    id: 'arkui-chapter', title: '当前章节', objective: '通过追问澄清最近一次答题', blocks: [block]
  }
  const context: AgentContextPayload = {
    bookId: 'arkui-current', title: '互动学习书', scope: 'chapter', label: '当前章节',
    chapters: [chapter], sources: [], warnings: ['鸿蒙端最小上下文']
  }
  return { question, history: [], context }
}

function dispatchFrame(frame: SseFrame, onEvent: (event: BookAgentEvent) => void): void {
  if (frame.type === 'delta') {
    const payload: DeltaPayload = JSON.parse(frame.data) as DeltaPayload
    if (typeof payload.text !== 'string') {
      throw new Error('invalid_agent_stream')
    }
    onEvent(new BookAgentEvent('delta', payload.text))
  } else if (frame.type === 'error') {
    const payload: ErrorPayload = JSON.parse(frame.data) as ErrorPayload
    onEvent(new BookAgentEvent('error', payload.message, payload.code))
  } else if (frame.type === 'start') {
    onEvent(new BookAgentEvent('start'))
  } else if (frame.type === 'sources') {
    onEvent(new BookAgentEvent('sources'))
  } else {
    onEvent(new BookAgentEvent('done'))
  }
}

export class HttpBookAgentGateway implements BookAgentGateway {
  async stream(question: string, contextText: string,
    onEvent: (event: BookAgentEvent) => void): Promise<void> {
    const request: http.HttpRequest = http.createHttp()
    const parser = new SseFrameParser()
    const decoder = new util.TextDecoder()
    let callbackError: Error | null = null
    request.on('dataReceive', (data: ArrayBuffer): void => {
      if (callbackError !== null) {
        return
      }
      try {
        const chunk: string = decoder.decodeToString(new Uint8Array(data), { stream: true })
        const frames: Array<SseFrame> = parser.push(chunk, false)
        for (let index: number = 0; index < frames.length; index++) {
          dispatchFrame(frames[index], onEvent)
        }
      } catch (error) {
        callbackError = new Error((error as Error).message)
      }
    })
    try {
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.POST,
        extraData: JSON.stringify(requestPayload(question, contextText)),
        header: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        connectTimeout: ServerConfig.TIMEOUT_MS,
        readTimeout: 60000,
        usingCache: false
      }
      const responseCode: number = await request.requestInStream(
        ServerConfig.BASE_URL + '/api/agent/book-chat', options)
      if (callbackError !== null) {
        throw new Error((callbackError as Error).message)
      }
      const tail: string = decoder.decodeToString(new Uint8Array(), { stream: false })
      const remaining: Array<SseFrame> = parser.push(tail, true)
      for (let index: number = 0; index < remaining.length; index++) {
        dispatchFrame(remaining[index], onEvent)
      }
      if (responseCode < 200 || responseCode >= 300) {
        throw new Error('http_' + responseCode)
      }
      if (!parser.hasTerminal()) {
        throw new Error('incomplete_agent_stream')
      }
    } catch (error) {
      throw new Error((error as Error).message)
    } finally {
      request.off('dataReceive')
      request.destroy()
    }
  }
}
