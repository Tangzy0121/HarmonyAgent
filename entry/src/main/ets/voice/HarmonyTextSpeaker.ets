import { textToSpeech } from '@kit.CoreSpeechKit'
import { SpeechPlaybackGateway, SpeechPlaybackListener } from './TextSpeaker'

class HarmonySpeakListener implements textToSpeech.SpeakListener {
  private owner: HarmonyTextSpeaker

  constructor(owner: HarmonyTextSpeaker) {
    this.owner = owner
  }
  onStart(_requestId: string, _response: textToSpeech.StartResponse): void {
  }

  onComplete(_requestId: string, _response: textToSpeech.CompleteResponse): void {
  }

  onStop(_requestId: string, _response: textToSpeech.StopResponse): void {
  }

  onError(_requestId: string, _errorCode: number, _errorMessage: string): void {
    this.owner.forwardError()
  }
}

export class HarmonyTextSpeaker implements SpeechPlaybackGateway {
  private engine: textToSpeech.TextToSpeechEngine | null = null
  private sequence: number = 0
  private listener: SpeechPlaybackListener | null = null

  observe(listener: SpeechPlaybackListener): void {
    this.listener = listener
  }

  forwardError(): void {
    this.listener?.onError()
  }

  private async ensureEngine(): Promise<textToSpeech.TextToSpeechEngine> {
    if (this.engine === null) {
      try {
        this.engine = await textToSpeech.createEngine({ language: 'zh-CN', person: 0, online: 0 })
      } catch (error) {
        throw new Error((error as Error).message)
      }
      this.engine.setListener(new HarmonySpeakListener(this))
    }
    return this.engine
  }

  async speak(text: string): Promise<void> {
    const engine: textToSpeech.TextToSpeechEngine = await this.ensureEngine()
    this.sequence += 1
    try {
      engine.speak(text, { requestId: `tts-${Date.now()}-${this.sequence}` })
    } catch (error) {
      throw new Error((error as Error).message)
    }
  }

  async stop(): Promise<void> {
    this.engine?.stop()
  }

  async shutdown(): Promise<void> {
    if (this.engine === null) return
    try {
      this.engine.stop()
    } catch (_error) {
    }
    this.engine.shutdown()
    this.engine = null
  }
}
