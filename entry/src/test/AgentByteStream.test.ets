import { describe, expect, it } from '@ohos/hypium'
import { AgentEventEnvelopeV1 } from '../main/ets/agent/runtime/AgentEventParser'
import { AgentEventByteStream } from '../main/ets/agent/runtime/AgentEventByteStream'

const PREFIX: string = 'event: content_delta\r\ndata: {"version":"1","turnId":"turn-byte","eventId":"1",' +
  '"timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"turn-byte:delta:1",' +
  '"type":"content_delta","payload":{"text":"'
const SUFFIX: string = '"}}\r\n\r\n'

function encodeUtf8(value: string): Uint8Array {
  const bytes: Array<number> = []
  for (let index: number = 0; index < value.length; index++) {
    const code: number = value.charCodeAt(index)
    if (code <= 0x7f) {
      bytes.push(code)
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6))
      bytes.push(0x80 | (code & 0x3f))
    } else {
      bytes.push(0xe0 | (code >> 12))
      bytes.push(0x80 | ((code >> 6) & 0x3f))
      bytes.push(0x80 | (code & 0x3f))
    }
  }
  return new Uint8Array(bytes)
}

class OpenStreamRequest {
  destroyCalls: number = 0

  destroy(): void {
    this.destroyCalls += 1
  }
}

export default function agentByteStreamTest(): void {
  describe('AgentEventByteStream', () => {
    it('decodes_real_utf8_byte_chunks_split_inside_a_chinese_character', 0, () => {
      const bytes: Uint8Array = encodeUtf8(PREFIX + '监督学习' + SUFFIX)
      const split: number = encodeUtf8(PREFIX).length + 1
      expect(bytes.length > split).assertTrue()
      const events: Array<AgentEventEnvelopeV1> = []
      let failures: number = 0
      const stream = new AgentEventByteStream(
        (event: AgentEventEnvelopeV1): void => { events.push(event) },
        (): void => { failures += 1 })

      stream.push(bytes.subarray(0, split))
      stream.push(bytes.subarray(split))
      stream.finish()

      expect(events.length).assertEqual(1)
      expect(events[0].text).assertEqual('监督学习')
      expect(failures).assertEqual(0)
    })

    it('malformed_open_stream_aborts_immediately_and_only_once_without_waiting_for_eof', 0, () => {
      const invalid: Uint8Array = encodeUtf8('event: content_delta\r\ndata: ' +
        '{"version":"2","turnId":"turn-byte","eventId":"1",' +
        '"timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"bad",' +
        '"type":"content_delta","payload":{"text":"私密"}}\r\n\r\n')
      const request = new OpenStreamRequest()
      let events: number = 0
      const stream = new AgentEventByteStream(
        (_event: AgentEventEnvelopeV1): void => { events += 1 },
        (): void => request.destroy())

      stream.push(invalid)
      stream.push(invalid)

      expect(request.destroyCalls).assertEqual(1)
      expect(events).assertEqual(0)
    })
  })
}
