import { describe, expect, it } from '@ohos/hypium'
import { LociSseFrameParser } from '../main/ets/loci/data/LociSseFrameParser'

export default function lociSseFrameParserTest(): void {
  describe('LociSseFrameParser', () => {
    it('dispatches_multiline_data_when_a_frame_ends', 0, () => {
      const events: string[] = []
      const payloads: string[] = []
      const parser = new LociSseFrameParser((event: string, data: string): void => {
        events.push(event)
        payloads.push(data)
      })

      parser.pushLine('event: block\r')
      parser.pushLine('data: {"index": 0,')
      parser.pushLine('data: "title": "监督学习"}')
      parser.pushLine('')

      expect(events.length).assertEqual(1)
      expect(events[0]).assertEqual('block')
      expect(payloads[0]).assertEqual('{"index": 0,\n"title": "监督学习"}')
    })

    it('ignores_comments_and_flushes_the_last_frame_on_end', 0, () => {
      const events: string[] = []
      const payloads: string[] = []
      const parser = new LociSseFrameParser((event: string, data: string): void => {
        events.push(event)
        payloads.push(data)
      })

      parser.pushLine(': keep-alive')
      parser.pushLine('event: chapter_done')
      parser.pushLine('data: {}')
      parser.end()

      expect(events.length).assertEqual(1)
      expect(events[0]).assertEqual('chapter_done')
      expect(payloads[0]).assertEqual('{}')
    })
  })
}
