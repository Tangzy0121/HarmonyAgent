import { describe, expect, it } from '@ohos/hypium'
import { AgentEventEnvelopeV1, parseAgentEventEnvelope, parseAgentEventJson } from '../main/ets/agent/runtime/AgentEventParser'
import { SseFrame, SseFrameParser } from '../main/ets/agent/SseFrameParser'
import { AGENT_EVENTS_V1_SSE } from './AgentRuntimeFixture'

export default function agentEventParserTest(): void {
  describe('AgentEventParser', () => {
    it('fixture_survives_chunked_chinese_and_eof_flush', 0, () => {
      const parser = new SseFrameParser(true)
      const withoutFinalDelimiter: string = AGENT_EVENTS_V1_SSE.substring(0, AGENT_EVENTS_V1_SSE.length - 2)
      const split: number = withoutFinalDelimiter.indexOf('监督学习') + 2
      const first: Array<SseFrame> = parser.push(withoutFinalDelimiter.substring(0, split), false)
      const frames: Array<SseFrame> = first.concat(parser.push(withoutFinalDelimiter.substring(split), true))
      const events: Array<AgentEventEnvelopeV1> = []
      for (let index: number = 0; index < frames.length; index++) {
        const event: AgentEventEnvelopeV1 | null = parseAgentEventEnvelope(frames[index])
        if (event !== null) events.push(event)
      }

      expect(events.length).assertEqual(5)
      expect(events[2].text).assertEqual('监督学习使用带标签样本。')
      expect(events[3].citation?.pageRange).assertEqual('4-5')
      expect(parser.hasTerminal()).assertTrue()
    })

    it('unknown_type_is_ignored_after_validating_public_fields', 0, () => {
      const frame = new SseFrame('future_event',
        '{"version":"1","turnId":"turn-1","eventId":"8","timestamp":"2026-08-14T00:00:00.000Z",' +
        '"idempotencyKey":"turn-1:future:8","type":"future_event","payload":{"safe":true}}')

      const parsed: AgentEventEnvelopeV1 | null = parseAgentEventEnvelope(frame)

      expect(parsed?.type).assertEqual('unknown')
      expect(parsed?.eventId).assertEqual('8')
    })

    it('invalid_public_fields_raise_only_safe_protocol_error', 0, () => {
      let message: string = ''
      try {
        parseAgentEventEnvelope(new SseFrame('content_delta',
          '{"version":"2","turnId":"turn-1","eventId":"1","timestamp":"2026-08-14T00:00:00.000Z",' +
          '"idempotencyKey":"turn-1:delta:1","type":"content_delta","payload":{"text":"private"}}'))
      } catch (error) {
        message = (error as Error).message
      }

      expect(message).assertEqual('invalid_agent_event')
      expect(message.indexOf('private')).assertEqual(-1)
    })

    it('safe_evidence_event_drops_receipt_and_action_fields', 0, () => {
      const parsed = parseAgentEventEnvelope(new SseFrame('evidence_recorded',
        '{"version":"1","turnId":"turn-1","eventId":"9","timestamp":"2026-08-14T00:00:00.000Z",' +
        '"idempotencyKey":"turn-1:evidence:9","type":"evidence_recorded","payload":{' +
        '"evidenceId":"evidence-1","projectionStatus":"projected","receipt":"private-receipt",' +
        '"action":{"type":"append_evidence"}}}'))
      const serialized: string = JSON.stringify(parsed)

      expect(parsed?.evidenceId).assertEqual('evidence-1')
      expect(serialized.indexOf('receipt')).assertEqual(-1)
      expect(serialized.indexOf('append_evidence')).assertEqual(-1)
    })

    it('unknown_sse_type_still_validates_the_v1_public_envelope', 0, () => {
      const parser = new SseFrameParser(true)
      const frames = parser.push('event: future_event\ndata: {"version":"2","turnId":"turn-1",' +
        '"eventId":"8","timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"future-8",' +
        '"type":"future_event","payload":{}}\n\n', true)
      let message: string = ''
      try {
        parseAgentEventEnvelope(frames[0])
      } catch (error) {
        message = (error as Error).message
      }

      expect(frames.length).assertEqual(1)
      expect(message).assertEqual('invalid_agent_event')
    })

    it('valid_unknown_event_advances_cursor_without_changing_visible_session_state', 0, () => {
      const unknown: AgentEventEnvelopeV1 | null = parseAgentEventJson(
        '{"version":"1","turnId":"turn-1","eventId":"2","timestamp":"2026-08-14T00:00:00.000Z",' +
        '"idempotencyKey":"turn-1:future:2","type":"future_event","payload":{"private":"ignored"}}')

      expect(unknown?.type).assertEqual('unknown')
      expect(unknown?.text).assertEqual('')
      expect(unknown?.eventId).assertEqual('2')
    })

    it('strict_common_fields_reject_unsafe_event_id_and_array_payload', 0, () => {
      let unsafeIdRejected: boolean = false
      let arrayRejected: boolean = false
      let blankTypeRejected: boolean = false
      let mismatchedTypeRejected: boolean = false
      try {
        parseAgentEventJson('{"version":"1","turnId":"turn-1","eventId":"9007199254740993",' +
          '"timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"unsafe",' +
          '"type":"future_event","payload":{}}')
      } catch (error) {
        unsafeIdRejected = true
      }
      try {
        parseAgentEventJson('{"version":"1","turnId":"turn-1","eventId":"2",' +
          '"timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"array",' +
          '"type":"future_event","payload":[]}')
      } catch (error) {
        arrayRejected = true
      }
      try {
        parseAgentEventJson('{"version":"1","turnId":"turn-1","eventId":"2",' +
          '"timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"blank",' +
          '"type":"   ","payload":{}}')
      } catch (error) {
        blankTypeRejected = true
      }
      try {
        parseAgentEventEnvelope(new SseFrame('future_a',
          '{"version":"1","turnId":"turn-1","eventId":"2",' +
          '"timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"mismatch",' +
          '"type":"future_b","payload":{}}'))
      } catch (error) {
        mismatchedTypeRejected = true
      }

      expect(unsafeIdRejected).assertTrue()
      expect(arrayRejected).assertTrue()
      expect(blankTypeRejected).assertTrue()
      expect(mismatchedTypeRejected).assertTrue()
    })

    it('strict_discriminator_rejects_whitespace_for_known_unknown_and_sse_header_mismatch', 0, () => {
      const payloadPrefix: string = '{"version":"1","turnId":"turn-1","eventId":"2",' +
        '"timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"strict-type",'
      let knownRejected: boolean = false
      let unknownRejected: boolean = false
      let headerRejected: boolean = false
      try {
        parseAgentEventJson(payloadPrefix + '"type":" content_delta ","payload":{"text":"不能接受"}}')
      } catch (error) {
        knownRejected = true
      }
      try {
        parseAgentEventJson(payloadPrefix + '"type":" future_event ","payload":{}}')
      } catch (error) {
        unknownRejected = true
      }
      try {
        parseAgentEventEnvelope(new SseFrame('future_event ', payloadPrefix +
          '"type":"future_event","payload":{}}'))
      } catch (error) {
        headerRejected = true
      }

      expect(knownRejected).assertTrue()
      expect(unknownRejected).assertTrue()
      expect(headerRejected).assertTrue()
    })
  })
}
