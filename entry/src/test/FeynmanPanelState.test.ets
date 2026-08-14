import { describe, expect, it } from '@ohos/hypium'
import {
  FEYNMAN_RAW_LIMIT,
  FeynmanPanelState,
  buildFeynmanPanelState,
  limitFeynmanDraft
} from '../main/ets/components/learning/FeynmanPanelState'

export default function feynmanPanelStateTest(): void {
  describe('FeynmanPanelState', () => {
    it('keeps_raw_whitespace_while_deriving_submit_text_at_the_request_boundary', 0, () => {
      const draft: string = `  ${'讲'.repeat(2000)}  `
      const state: FeynmanPanelState = buildFeynmanPanelState(draft)

      expect(state.rawText).assertEqual(draft)
      expect(state.submitText).assertEqual('讲'.repeat(2000))
      expect(state.canSubmit).assertTrue()
      expect(state.effectiveLength).assertEqual(2000)
    })

    it('rejects_trimmed_2001_and_caps_only_the_raw_buffer', 0, () => {
      const tooLong: FeynmanPanelState = buildFeynmanPanelState(` ${'讲'.repeat(2001)} `)
      const capped: string = limitFeynmanDraft('草'.repeat(FEYNMAN_RAW_LIMIT + 1))

      expect(tooLong.canSubmit).assertFalse()
      expect(tooLong.submitText).assertEqual('')
      expect(capped.length).assertEqual(FEYNMAN_RAW_LIMIT)
    })
  })
}
