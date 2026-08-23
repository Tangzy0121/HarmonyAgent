export type TextSpeakerPhase = 'idle' | 'speaking' | 'error'

export interface SpeechPlaybackListener {
  onError(): void
}

export interface SpeechPlaybackGateway {
  observe(listener: SpeechPlaybackListener): void
  speak(text: string): Promise<void>
  stop(): Promise<void>
  shutdown(): Promise<void>
}

export class TextSpeaker implements SpeechPlaybackListener {
  private gateway: SpeechPlaybackGateway
  private observer: (() => void) | null = null
  phase: TextSpeakerPhase = 'idle'
  errorMessage: string = ''

  constructor(gateway: SpeechPlaybackGateway) {
    this.gateway = gateway
    this.gateway.observe(this)
  }

  observe(observer: () => void): void {
    this.observer = observer
  }

  private notify(): void {
    this.observer?.()
  }

  onError(): void {
    this.phase = 'error'
    this.errorMessage = '朗读暂不可用，请继续阅读文字内容。'
    this.notify()
  }

  async speak(text: string): Promise<void> {
    const value: string = text.trim()
    if (value.length === 0) return
    if (this.phase === 'speaking') await this.stop()
    this.errorMessage = ''
    try {
      await this.gateway.speak(value)
      this.phase = 'speaking'
      this.notify()
    } catch (_error) {
      this.phase = 'error'
      this.errorMessage = '朗读暂不可用，请继续阅读文字内容。'
      this.notify()
    }
  }

  async stop(): Promise<void> {
    if (this.phase !== 'speaking') return
    try {
      await this.gateway.stop()
    } catch (_error) {
    }
    this.phase = 'idle'
    this.notify()
  }

  async shutdown(): Promise<void> {
    await this.stop()
    try {
      await this.gateway.shutdown()
    } catch (_error) {
    }
    this.phase = 'idle'
    this.notify()
  }
}
