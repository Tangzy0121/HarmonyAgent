import { describe, expect, it } from '@ohos/hypium'
import { AgentCitation, AgentQuestion } from '../main/ets/agent/runtime/AgentEventParser'
import {
  agentCitationKey,
  agentOptionMinHeight,
  buildAgentDrawerState
} from '../main/ets/components/agent/AgentDrawerState'

export default function agentDrawerStateTest(): void {
  describe('AgentDrawerState', () => {
    it('streaming_state_exposes_body_activity_citations_and_cancel', 0, () => {
      const state = buildAgentDrawerState('streaming', '正在解释',
        [new AgentCitation('S1', 'lecture.pdf', '4-5')], ['正在核对章节依据'], null, '')

      expect(state.bodyText).assertEqual('正在解释')
      expect(state.citations[0].label).assertEqual('lecture.pdf · 4-5')
      expect(state.activityLabel).assertEqual('正在核对章节依据')
      expect(state.showCancel).assertTrue()
      expect(state.showRetry).assertFalse()
    })

    it('waiting_state_exposes_options_and_optional_free_text', 0, () => {
      const question = new AgentQuestion('q-1', '请选择章节', ['第一章', '第二章'], true)
      const state = buildAgentDrawerState('waitingUser', '', [], [], question, '')

      expect(state.question?.options.length).assertEqual(2)
      expect(state.question?.allowFreeText).assertTrue()
      expect(state.showCancel).assertTrue()
    })

    it('error_state_exposes_retry_without_private_error_details', 0, () => {
      const state = buildAgentDrawerState('error', '', [], [], null, 'socket secret detail')

      expect(state.errorMessage).assertEqual('连接学习助手失败，请重试。')
      expect(state.showRetry).assertTrue()
      expect(state.showCancel).assertFalse()
    })

    it('cancelled_state_hides_cancel_retry_and_question_controls', 0, () => {
      const question = new AgentQuestion('q-1', '不会再显示', ['选项'], true)
      const state = buildAgentDrawerState('cancelled', '已停止', [], [], question, '')

      expect(state.showCancel).assertFalse()
      expect(state.showRetry).assertFalse()
      expect(state.question).assertNull()
    })

    it('citation_keys_include_locator_and_long_options_request_adaptive_height', 0, () => {
      const first = new AgentCitation('S1', 'lecture.pdf', '4-5')
      const second = new AgentCitation('S1', 'lecture.pdf', '8-9')

      expect(agentCitationKey(first) === agentCitationKey(second)).assertFalse()
      expect(agentOptionMinHeight('短选项')).assertEqual(44)
      expect(agentOptionMinHeight('这是一个需要自动换行而不能被固定高度裁切的很长选项文本')).assertEqual(64)
    })
  })
}
