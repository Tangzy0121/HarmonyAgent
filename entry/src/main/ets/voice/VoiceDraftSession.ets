export type VoiceDraftPhase = 'idle' | 'requestingPermission' | 'recording' | 'finishing' | 'error'

export interface SpeechRecognitionListener {
  onTranscript(text: string): void
  onError(message: string): void
}

export interface SpeechRecognitionGateway {
  requestPermission(): Promise<boolean>
  start(listener: SpeechRecognitionListener): Promise<void>
  finish(): Promise<void>
  cancel(): Promise<void>
  shutdown(): Promise<void>
}

class SessionSpeechListener implements SpeechRecognitionListener {
  private session: VoiceDraftSession

  constructor(session: VoiceDraftSession) {
    this.session = session
  }

  onTranscript(text: string): void {
    this.session.acceptTranscript(text)
  }

  onError(_message: string): void {
    this.session.acceptError()
  }
}

export class VoiceDraftSession {
  private gateway: SpeechRecognitionGateway
  private originalDraft: string = ''
  phase: VoiceDraftPhase = 'idle'
  draft: string = ''
  errorMessage: string = ''
  private observer: (() => void) | null = null
  private sessionActive: boolean = false

  constructor(gateway: SpeechRecognitionGateway) {
    this.gateway = gateway
  }

  observe(observer: () => void): void {
    this.observer = observer
  }

  private notify(): void {
    this.observer?.()
  }

  async press(currentDraft: string): Promise<void> {
    if (this.phase === 'recording' || this.phase === 'finishing') return
    this.originalDraft = currentDraft
    this.draft = currentDraft
    this.errorMessage = ''
    this.phase = 'requestingPermission'
    this.sessionActive = true
    this.notify()
    try {
      const granted: boolean = await this.gateway.requestPermission()
      if (!granted) {
        this.phase = 'error'
        this.errorMessage = '未获得麦克风权限，仍可继续使用完整文字输入。'
        this.sessionActive = false
        this.notify()
        return
      }
      await this.gateway.start(new SessionSpeechListener(this))
      this.phase = 'recording'
      this.notify()
    } catch (_error) {
      this.phase = 'error'
      this.errorMessage = '语音识别暂不可用，仍可继续使用完整文字输入。'
      this.sessionActive = false
      this.notify()
    }
  }

  async release(): Promise<void> {
    if (this.phase !== 'recording') return
    this.phase = 'finishing'
    try {
      await this.gateway.finish()
      this.phase = 'idle'
      this.notify()
    } catch (_error) {
      this.acceptError()
    }
  }

  async cancel(): Promise<void> {
    if (this.phase === 'recording' || this.phase === 'finishing') {
      try {
        await this.gateway.cancel()
      } catch (_error) {
      }
    }
    this.draft = this.originalDraft
    this.errorMessage = ''
    this.phase = 'idle'
    this.sessionActive = false
    this.notify()
  }

  edit(value: string): void {
    this.draft = value
    this.notify()
  }

  acceptTranscript(value: string): void {
    if (!this.sessionActive) return
    const transcript: string = value.trim()
    if (transcript.length === 0) return
    this.draft = this.originalDraft.trim().length > 0 ? `${this.originalDraft} ${transcript}` : transcript
    this.notify()
  }

  acceptError(): void {
    if (!this.sessionActive) return
    this.draft = this.originalDraft
    this.phase = 'error'
    this.errorMessage = '语音识别失败，原有文字已保留，可继续编辑。'
    this.sessionActive = false
    this.notify()
  }

  async shutdown(): Promise<void> {
    if (this.phase === 'recording' || this.phase === 'finishing') {
      try {
        await this.gateway.cancel()
      } catch (_error) {
      }
    }
    await this.gateway.shutdown()
    this.phase = 'idle'
    this.sessionActive = false
    this.notify()
  }
}
