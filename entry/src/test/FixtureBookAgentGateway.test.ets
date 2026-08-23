import { describe, expect, it } from '@ohos/hypium'
import { BookAgentEvent } from '../main/ets/agent/BookAgentModels'
import { FixtureBookAgentGateway } from '../main/ets/agent/FixtureBookAgentGateway'

export default function fixtureBookAgentGatewayTest(): void {
  describe('FixtureBookAgentGateway', () => {
    it('stream_emits_delta_before_done', 0, async () => {
      const gateway = new FixtureBookAgentGateway()
      const events: Array<BookAgentEvent> = []

      await gateway.stream('为什么错了？', '监督学习章节；最近答错', (event: BookAgentEvent): void => {
        events.push(event)
      })

      expect(events.length).assertEqual(3)
      expect(events[0].type).assertEqual('start')
      expect(events[1].type).assertEqual('delta')
      expect(events[1].text).assertContain('目标标签')
      expect(events[2].type).assertEqual('done')
    })
  })
}
