import { describe, expect, it } from '@ohos/hypium'
import { DataMode } from '../main/ets/network/ServerConfig'
import { AgentEventEnvelopeV1, parseAgentEventJson } from '../main/ets/agent/runtime/AgentEventParser'
import {
  AgentRuntimeGateway,
  AgentTurnRequest,
  AgentEventListener
} from '../main/ets/agent/runtime/AgentRuntimeGateway'
import { AgentTurnSession } from '../main/ets/agent/runtime/AgentTurnSession'
import { USER_QUESTION_EVENT } from './AgentRuntimeFixture'

const STARTED: string = '{"version":"1","turnId":"turn-1","eventId":"1",' +
  '"timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"turn-1:started",' +
  '"type":"turn_started","payload":{"capability":"guided_learning"}}'
const DELTA_TWO: string = '{"version":"1","turnId":"turn-1","eventId":"2",' +
  '"timestamp":"2026-08-14T00:00:01.000Z","idempotencyKey":"turn-1:delta:1",' +
  '"type":"content_delta","payload":{"text":"监督"}}'
const DELTA_THREE: string = '{"version":"1","turnId":"turn-1","eventId":"3",' +
  '"timestamp":"2026-08-14T00:00:02.000Z","idempotencyKey":"turn-1:delta:2",' +
  '"type":"content_delta","payload":{"text":"学习"}}'
const COMPLETED: string = '{"version":"1","turnId":"turn-1","eventId":"4",' +
  '"timestamp":"2026-08-14T00:00:03.000Z","idempotencyKey":"turn-1:completed",' +
  '"type":"turn_completed","payload":{"status":"completed"}}'

function event(json: string): AgentEventEnvelopeV1 {
  return parseAgentEventJson(json) as AgentEventEnvelopeV1
}

class ReconnectingGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.HTTP
  reconnectCursor: string = ''
  receivedRequest: AgentTurnRequest | null = null
  start(request: AgentTurnRequest, listener: AgentEventListener): Promise<void> {
    this.receivedRequest = request
    listener(event(STARTED))
    listener(event(DELTA_TWO))
    return Promise.resolve()
  }
  reconnect(_turnId: string, lastEventId: string, listener: AgentEventListener): Promise<void> {
    this.reconnectCursor = lastEventId
    listener(event(DELTA_TWO))
    listener(event(STARTED))
    listener(event(DELTA_THREE))
    listener(event(COMPLETED))
    return Promise.resolve()
  }
  answer(_turnId: string, _questionId: string, _answer: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  cancel(_turnId: string): Promise<void> { return Promise.resolve() }
}

class QuestionGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.FIXTURE
  answeredTurnId: string = ''
  start(_request: AgentTurnRequest, listener: AgentEventListener): Promise<void> {
    listener(new AgentEventEnvelopeV1('turn-question', '1', 'turn_started'))
    listener(parseAgentEventJson(USER_QUESTION_EVENT) as AgentEventEnvelopeV1)
    return Promise.resolve()
  }
  reconnect(_turnId: string, _lastEventId: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  answer(turnId: string, _questionId: string, _answer: string,
    listener: AgentEventListener): Promise<void> {
    this.answeredTurnId = turnId
    listener(new AgentEventEnvelopeV1('turn-question', '3', 'turn_completed'))
    return Promise.resolve()
  }
  cancel(_turnId: string): Promise<void> { return Promise.resolve() }
}

class OutOfOrderGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.HTTP
  reconnects: number = 0
  start(_request: AgentTurnRequest, listener: AgentEventListener): Promise<void> {
    listener(event(STARTED))
    listener(event(DELTA_TWO))
    return Promise.resolve()
  }
  reconnect(_turnId: string, _lastEventId: string, listener: AgentEventListener): Promise<void> {
    this.reconnects += 1
    if (this.reconnects === 1) {
      listener(event(COMPLETED))
      listener(event(DELTA_THREE))
    } else {
      listener(event(COMPLETED))
    }
    return Promise.resolve()
  }
  answer(_turnId: string, _questionId: string, _answer: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  cancel(_turnId: string): Promise<void> { return Promise.resolve() }
}

class EmptyStartGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.HTTP
  cancelCalled: boolean = false
  start(_request: AgentTurnRequest, _listener: AgentEventListener): Promise<void> {
    return Promise.resolve()
  }
  reconnect(_turnId: string, _lastEventId: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  answer(_turnId: string, _questionId: string, _answer: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  cancel(_turnId: string): Promise<void> {
    this.cancelCalled = true
    return Promise.resolve()
  }
}

class FlakyAnswerGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.HTTP
  answerCalls: number = 0
  answeredTurnId: string = ''
  start(_request: AgentTurnRequest, listener: AgentEventListener): Promise<void> {
    listener(new AgentEventEnvelopeV1('turn-question', '1', 'turn_started'))
    listener(parseAgentEventJson(USER_QUESTION_EVENT) as AgentEventEnvelopeV1)
    return Promise.resolve()
  }
  reconnect(_turnId: string, _lastEventId: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  answer(turnId: string, _questionId: string, _answer: string,
    listener: AgentEventListener): Promise<void> {
    this.answerCalls += 1
    this.answeredTurnId = turnId
    if (this.answerCalls === 1) return Promise.reject(new Error('network'))
    listener(new AgentEventEnvelopeV1(turnId, '3', 'turn_completed'))
    return Promise.resolve()
  }
  cancel(_turnId: string): Promise<void> { return Promise.resolve() }
}

class PendingStartGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.HTTP
  startCalls: number = 0
  cancelCalls: number = 0
  receivedMessage: string = ''
  start(request: AgentTurnRequest, listener: AgentEventListener): Promise<void> {
    this.startCalls += 1
    this.receivedMessage = request.message
    listener(new AgentEventEnvelopeV1('turn-pending', '1', 'turn_started'))
    return new Promise<void>(() => {})
  }
  reconnect(_turnId: string, _lastEventId: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  answer(_turnId: string, _questionId: string, _answer: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  cancel(_turnId: string): Promise<void> {
    this.cancelCalls += 1
    return Promise.resolve()
  }
}

class ResetRaceGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.HTTP
  listeners: Array<AgentEventListener> = []
  startCalls: number = 0
  cancelledTurnId: string = ''
  start(_request: AgentTurnRequest, listener: AgentEventListener): Promise<void> {
    this.listeners.push(listener)
    this.startCalls += 1
    if (this.startCalls === 1) {
      listener(new AgentEventEnvelopeV1('turn-old', '1', 'turn_started'))
      return new Promise<void>(() => {})
    }
    listener(new AgentEventEnvelopeV1('turn-new', '1', 'turn_started'))
    const delta = new AgentEventEnvelopeV1('turn-new', '2', 'content_delta')
    delta.text = '新回答'
    listener(delta)
    listener(new AgentEventEnvelopeV1('turn-new', '3', 'turn_completed'))
    return Promise.resolve()
  }
  reconnect(_turnId: string, _lastEventId: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  answer(_turnId: string, _questionId: string, _answer: string,
    _listener: AgentEventListener): Promise<void> { return Promise.resolve() }
  cancel(turnId: string): Promise<void> {
    this.cancelledTurnId = turnId
    return Promise.resolve()
  }
}

export default function agentTurnSessionTest(): void {
  describe('AgentTurnSession', () => {
    it('unexpected_eof_reconnects_from_cursor_and_deduplicates_replay', 0, async () => {
      const gateway = new ReconnectingGateway()
      const session = new AgentTurnSession(gateway)

      await session.start(new AgentTurnRequest('为什么？', 'learning', 'book-1', 'chapter-1', 'block-1'))

      expect(gateway.reconnectCursor).assertEqual('2')
      expect(session.lastEventId).assertEqual('4')
      expect(session.bodyText).assertEqual('监督学习')
      expect(session.phase).assertEqual('completed')
      expect(session.dataModeLabel).assertEqual('HTTP 服务')
      expect(gateway.receivedRequest?.bookId).assertEqual('book-1')
      expect(gateway.receivedRequest?.chapterId).assertEqual('chapter-1')
      expect(gateway.receivedRequest?.blockId).assertEqual('block-1')
    })

    it('answer_resumes_the_same_waiting_turn', 0, async () => {
      const gateway = new QuestionGateway()
      const session = new AgentTurnSession(gateway)

      await session.start(new AgentTurnRequest('继续学习', 'learning', 'book-1'))
      expect(session.phase).assertEqual('waitingUser')
      expect(session.pendingQuestion?.options.length).assertEqual(2)
      await session.answer('chapter-1')

      expect(gateway.answeredTurnId).assertEqual('turn-question')
      expect(session.phase).assertEqual('completed')
      expect(session.dataModeLabel).assertEqual('FIXTURE 演示数据')
    })

    it('explicit_cancel_never_reconnects', 0, async () => {
      const gateway = new ReconnectingGateway()
      const session = new AgentTurnSession(gateway)
      session.accept(event(STARTED))

      await session.cancel()

      expect(session.phase).assertEqual('cancelled')
      expect(gateway.reconnectCursor).assertEqual('')
    })

    it('out_of_order_future_event_waits_for_replay_without_losing_the_gap', 0, async () => {
      const gateway = new OutOfOrderGateway()
      const session = new AgentTurnSession(gateway)

      await session.start(new AgentTurnRequest('为什么？', 'learning', 'book-1', 'chapter-1'))

      expect(gateway.reconnects).assertEqual(2)
      expect(session.bodyText).assertEqual('监督学习')
      expect(session.lastEventId).assertEqual('4')
      expect(session.phase).assertEqual('completed')
    })

    it('eof_before_turn_started_enters_safe_error_instead_of_hanging_connecting', 0, async () => {
      const session = new AgentTurnSession(new EmptyStartGateway())

      await session.start(new AgentTurnRequest('开始', 'learning'))

      expect(session.phase).assertEqual('error')
      expect(session.errorMessage).assertEqual('连接学习助手失败，请重试。')
    })

    it('cancel_before_turn_id_still_aborts_the_gateway_start', 0, async () => {
      const gateway = new EmptyStartGateway()
      const session = new AgentTurnSession(gateway)
      const starting: Promise<void> = session.start(new AgentTurnRequest('开始', 'learning'))

      await session.cancel()
      await starting

      expect(gateway.cancelCalled).assertTrue()
      expect(session.phase).assertEqual('cancelled')
    })

    it('failed_answer_restores_question_and_retries_in_the_same_turn', 0, async () => {
      const gateway = new FlakyAnswerGateway()
      const session = new AgentTurnSession(gateway)
      await session.start(new AgentTurnRequest('继续', 'learning', 'book-1'))

      await session.answer('chapter-1')
      expect(session.phase).assertEqual('waitingUser')
      expect(session.pendingQuestion?.questionId).assertEqual('turn-question:chapter')
      expect(session.turnId).assertEqual('turn-question')

      await session.answer('chapter-1')
      expect(gateway.answerCalls).assertEqual(2)
      expect(gateway.answeredTurnId).assertEqual('turn-question')
      expect(session.phase).assertEqual('completed')
    })

    it('valid_unknown_event_advances_cursor_for_the_next_known_event', 0, () => {
      const session = new AgentTurnSession(new EmptyStartGateway())
      session.accept(event(STARTED))
      const unknown: AgentEventEnvelopeV1 | null = parseAgentEventJson(
        '{"version":"1","turnId":"turn-1","eventId":"2","timestamp":"2026-08-14T00:00:00.000Z",' +
        '"idempotencyKey":"turn-1:future:2","type":"future_event","payload":{}}')
      if (unknown !== null) session.accept(unknown)
      session.accept(event(DELTA_THREE))
      session.accept(event(COMPLETED))

      expect(session.bodyText).assertEqual('学习')
      expect(session.lastEventId).assertEqual('4')
      expect(session.phase).assertEqual('completed')
    })

    it('double_start_does_not_reset_or_launch_a_second_active_request', 0, async () => {
      const gateway = new PendingStartGateway()
      const session = new AgentTurnSession(gateway)
      session.start(new AgentTurnRequest('第一问', 'learning'))

      await session.start(new AgentTurnRequest('第二问', 'learning'))

      expect(gateway.startCalls).assertEqual(1)
      expect(gateway.receivedMessage).assertEqual('第一问')
      expect(session.turnId).assertEqual('turn-pending')
      await session.cancel()
      expect(gateway.cancelCalls).assertEqual(1)
    })

    it('cancel_then_new_start_ignores_every_stale_callback_from_the_old_request', 0, async () => {
      const gateway = new ResetRaceGateway()
      const session = new AgentTurnSession(gateway)
      session.start(new AgentTurnRequest('旧问题', 'learning'))
      await session.cancel()
      expect(gateway.cancelledTurnId).assertEqual('turn-old')

      await session.start(new AgentTurnRequest('新问题', 'learning'))
      const stale = new AgentEventEnvelopeV1('turn-old', '2', 'content_delta')
      stale.text = '过期内容'
      gateway.listeners[0](stale)

      expect(session.turnId).assertEqual('turn-new')
      expect(session.bodyText).assertEqual('新回答')
      expect(session.phase).assertEqual('completed')
    })
  })
}
