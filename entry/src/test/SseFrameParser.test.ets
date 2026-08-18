import { describe, expect, it } from '@ohos/hypium'
import { SseFrameParser } from '../main/ets/agent/SseFrameParser'

export default function sseFrameParserTest(): void {
  describe('SseFrameParser', () => {
    it('push_preserves_partial_frame_across_chunks', 0, () => {
      const parser = new SseFrameParser()

      const first = parser.push('event: delta\r\ndata: {"text":"你', false)
      const second = parser.push('好"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n', false)

      expect(first.length).assertEqual(0)
      expect(second.length).assertEqual(2)
      expect(second[0].type).assertEqual('delta')
      expect(second[0].data).assertEqual('{"text":"你好"}')
      expect(parser.hasTerminal()).assertTrue()
    })

    it('push_ignores_unknown_events_without_marking_terminal', 0, () => {
      const parser = new SseFrameParser()

      const frames = parser.push('event: heartbeat\ndata: {}\n\n', true)

      expect(frames.length).assertEqual(0)
      expect(parser.hasTerminal()).assertFalse()
    })

    it('push_normalizes_crlf_when_the_pair_is_split_across_chunks', 0, () => {
      const parser = new SseFrameParser()

      const first = parser.push('event: delta\r\ndata: {"text":"你好"}\r', false)
      const second = parser.push('\n\r\nevent: done\r\ndata: {}\r\n\r\n', false)

      expect(first.length).assertEqual(0)
      expect(second.length).assertEqual(2)
      expect(second[0].data).assertEqual('{"text":"你好"}')
      expect(parser.hasTerminal()).assertTrue()
    })

    it('push_preserves_trailing_event_discriminator_whitespace_for_strict_validation', 0, () => {
      const parser = new SseFrameParser(true)

      const frames = parser.push('event: future_event \r\ndata: {}\r\n\r\n', true)

      expect(frames.length).assertEqual(1)
      expect(frames[0].type).assertEqual('future_event ')
    })
  })
}
