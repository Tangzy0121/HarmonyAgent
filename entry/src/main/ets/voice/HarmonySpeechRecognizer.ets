import { PermissionRequestResult, Permissions, abilityAccessCtrl, common } from '@kit.AbilityKit'
import { audio } from '@kit.AudioKit'
import { speechRecognizer } from '@kit.CoreSpeechKit'
import { SpeechRecognitionGateway, SpeechRecognitionListener } from './VoiceDraftSession'

const MICROPHONE_PERMISSION: Permissions = 'ohos.permission.MICROPHONE'
const PCM_CHUNK_BYTES: number = 640

class HarmonyRecognitionListener implements speechRecognizer.RecognitionListener {
  private owner: HarmonySpeechRecognizer

  constructor(owner: HarmonySpeechRecognizer) {
    this.owner = owner
  }

  onStart(_sessionId: string, _eventMessage: string): void {
  }

  onEvent(_sessionId: string, _eventCode: number, _eventMessage: string): void {
  }

  onResult(_sessionId: string, result: speechRecognizer.SpeechRecognitionResult): void {
    this.owner.forwardTranscript(result.result)
  }

  onComplete(_sessionId: string, _eventMessage: string): void {
  }

  onError(_sessionId: string, _errorCode: number, errorMessage: string): void {
    this.owner.forwardError(errorMessage)
  }
}

export class HarmonySpeechRecognizer implements SpeechRecognitionGateway {
  private context: common.UIAbilityContext
  private permissionResolved: boolean = false
  private permissionGranted: boolean = false
  private engine: speechRecognizer.SpeechRecognitionEngine | null = null
  private capturer: audio.AudioCapturer | null = null
  private listener: SpeechRecognitionListener | null = null
  private sessionId: string = ''
  private pendingPcm: Uint8Array = new Uint8Array(0)

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  async requestPermission(): Promise<boolean> {
    if (this.permissionResolved) return this.permissionGranted
    this.permissionResolved = true
    const manager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager()
    try {
      const result: PermissionRequestResult = await manager.requestPermissionsFromUser(
        this.context, [MICROPHONE_PERMISSION])
      this.permissionGranted = result.authResults.length === 1 && result.authResults[0] === 0
    } catch (_error) {
      this.permissionGranted = false
    }
    return this.permissionGranted
  }

  async start(listener: SpeechRecognitionListener): Promise<void> {
    if (!this.permissionGranted) throw new Error('microphone_permission_denied')
    await this.releaseCapturer()
    this.listener = listener
    this.pendingPcm = new Uint8Array(0)
    this.sessionId = `voice-${Date.now()}`
    const options: audio.AudioCapturerOptions = {
      streamInfo: {
        samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_16000,
        channels: audio.AudioChannel.CHANNEL_1,
        sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
        encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW
      },
      capturerInfo: {
        source: audio.SourceType.SOURCE_TYPE_MIC,
        capturerFlags: 0
      }
    }
    try {
      if (this.engine === null) {
        this.engine = await speechRecognizer.createEngine({ language: 'zh-CN', online: 0 })
        this.engine.setListener(new HarmonyRecognitionListener(this))
      }
      this.capturer = await audio.createAudioCapturer(options)
      this.capturer.on('readData', (buffer: ArrayBuffer): void => this.writePcm(buffer))
      this.engine.startListening({
        sessionId: this.sessionId,
        audioInfo: { audioType: 'pcm', sampleRate: 16000, soundChannel: 1, sampleBit: 16 }
      })
      await this.capturer.start()
    } catch (error) {
      await this.releaseCapturer()
      throw new Error((error as Error).message)
    }
  }

  private writePcm(buffer: ArrayBuffer): void {
    if (this.engine === null || this.sessionId.length === 0) return
    const incoming: Uint8Array = new Uint8Array(buffer)
    const combined: Uint8Array = new Uint8Array(this.pendingPcm.length + incoming.length)
    combined.set(this.pendingPcm, 0)
    combined.set(incoming, this.pendingPcm.length)
    let offset: number = 0
    while (combined.length - offset >= PCM_CHUNK_BYTES) {
      try {
        this.engine.writeAudio(this.sessionId, combined.slice(offset, offset + PCM_CHUNK_BYTES))
      } catch (error) {
        this.forwardError((error as Error).message)
        return
      }
      offset += PCM_CHUNK_BYTES
    }
    this.pendingPcm = combined.slice(offset)
  }

  async finish(): Promise<void> {
    await this.releaseCapturer()
    if (this.engine !== null && this.sessionId.length > 0) {
      try {
        this.engine.finish(this.sessionId)
      } catch (error) {
        throw new Error((error as Error).message)
      }
    }
    this.sessionId = ''
    this.pendingPcm = new Uint8Array(0)
  }

  async cancel(): Promise<void> {
    await this.releaseCapturer()
    if (this.engine !== null && this.sessionId.length > 0) {
      try {
        this.engine.cancel(this.sessionId)
      } catch (error) {
        throw new Error((error as Error).message)
      }
    }
    this.sessionId = ''
    this.pendingPcm = new Uint8Array(0)
  }

  private async releaseCapturer(): Promise<void> {
    const current: audio.AudioCapturer | null = this.capturer
    this.capturer = null
    if (current === null) return
    try {
      current.off('readData')
    } catch (_error) {
    }
    try {
      await current.stop()
    } catch (_error) {
    }
    try {
      await current.release()
    } catch (_error) {
    }
  }

  forwardTranscript(text: string): void {
    this.listener?.onTranscript(text)
  }

  forwardError(message: string): void {
    this.listener?.onError(message)
  }

  async shutdown(): Promise<void> {
    await this.cancel()
    this.engine?.shutdown()
    this.engine = null
    this.listener = null
  }
}
