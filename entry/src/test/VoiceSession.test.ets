import { describe, expect, it } from '@ohos/hypium'
import {
  SpeechRecognitionGateway,
  SpeechRecognitionListener,
  VoiceDraftSession
} from '../main/ets/voice/VoiceDraftSession'
import {
  SpeechPlaybackGateway,
  SpeechPlaybackListener,
  TextSpeaker
} from '../main/ets/voice/TextSpeaker'

class FakeSpeechGateway implements SpeechRecognitionGateway {
  permissionGranted: boolean = true
  listener: SpeechRecognitionListener | null = null
  starts: number = 0
  finishes: number = 0
  cancels: number = 0
  shutdowns: number = 0

  async requestPermission(): Promise<boolean> {
    return this.permissionGranted
  }

  async start(listener: SpeechRecognitionListener): Promise<void> {
    this.starts += 1
    this.listener = listener
  }

  async finish(): Promise<void> {
    this.finishes += 1
  }

  async cancel(): Promise<void> {
    this.cancels += 1
  }

  async shutdown(): Promise<void> {
    this.shutdowns += 1
  }

  transcribe(value: string): void {
    this.listener?.onTranscript(value)
  }

  fail(): void {
    this.listener?.onError('asr_failed')
  }
}

class FakePlaybackGateway implements SpeechPlaybackGateway {
  spoken: Array<string> = []
  stops: number = 0
  shutdowns: number = 0
  listener: SpeechPlaybackListener | null = null

  observe(listener: SpeechPlaybackListener): void {
    this.listener = listener
  }

  async speak(text: string): Promise<void> {
    this.spoken.push(text)
  }

  async stop(): Promise<void> {
    this.stops += 1
  }

  async shutdown(): Promise<void> {
    this.shutdowns += 1
  }

  fail(): void {
    this.listener?.onError()
  }
}

export default function voiceSessionTest(): void {
  describe('voice draft and text speaker', () => {
    it('press_requests_permission_starts_and_release_finishes_into_an_editable_raw_draft', 0, async () => {
      const gateway = new FakeSpeechGateway()
      const session = new VoiceDraftSession(gateway)

      await session.press('已有问题')
      gateway.transcribe('补充说明')
      await session.release()
      session.edit('已有问题，补充说明（已编辑）')

      expect(gateway.starts).assertEqual(1)
      expect(gateway.finishes).assertEqual(1)
      expect(session.draft).assertEqual('已有问题，补充说明（已编辑）')
      expect(session.phase).assertEqual('idle')
    })

    it('cancel_restores_the_pre_recording_draft_and_cancels_the_gateway', 0, async () => {
      const gateway = new FakeSpeechGateway()
      const session = new VoiceDraftSession(gateway)
      await session.press('不要丢失')
      gateway.transcribe('临时转写')

      await session.cancel()
      gateway.fail()

      expect(gateway.cancels).assertEqual(1)
      expect(session.draft).assertEqual('不要丢失')
      expect(session.phase).assertEqual('idle')
    })

    it('permission_denial_and_asr_error_keep_the_complete_text_fallback', 0, async () => {
      const deniedGateway = new FakeSpeechGateway()
      deniedGateway.permissionGranted = false
      const denied = new VoiceDraftSession(deniedGateway)
      await denied.press('仍可键盘输入')

      expect(deniedGateway.starts).assertEqual(0)
      expect(denied.draft).assertEqual('仍可键盘输入')
      expect(denied.errorMessage).assertContain('麦克风')

      const failingGateway = new FakeSpeechGateway()
      const failing = new VoiceDraftSession(failingGateway)
      await failing.press('保留原文')
      failingGateway.fail()

      expect(failing.draft).assertEqual('保留原文')
      expect(failing.errorMessage).assertContain('文字')
    })

    it('speaker_stops_previous_or_active_speech_and_shutdown_releases_it', 0, async () => {
      const gateway = new FakePlaybackGateway()
      const speaker = new TextSpeaker(gateway)

      await speaker.speak('第一段')
      await speaker.speak('第二段')
      await speaker.stop()
      await speaker.shutdown()

      expect(gateway.spoken.length).assertEqual(2)
      expect(gateway.stops).assertEqual(2)
      expect(gateway.shutdowns).assertEqual(1)
      expect(speaker.phase).assertEqual('idle')
    })

    it('asynchronous_tts_network_error_returns_to_the_complete_text_fallback', 0, async () => {
      const gateway = new FakePlaybackGateway()
      const speaker = new TextSpeaker(gateway)
      await speaker.speak('文字仍然可见')

      gateway.fail()

      expect(speaker.phase).assertEqual('error')
      expect(speaker.errorMessage).assertContain('文字')
    })
  })
}
