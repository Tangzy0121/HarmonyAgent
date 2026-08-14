import { AgentCitation, AgentQuestion } from '../agent/runtime/AgentEventParser'
import { AgentTurnRequest } from '../agent/runtime/AgentRuntimeGateway'
import { AgentTurnPhase, AgentTurnSession } from '../agent/runtime/AgentTurnSession'
import { FixtureAgentRuntimeGateway } from '../agent/runtime/FixtureAgentRuntimeGateway'
import { HttpAgentRuntimeGateway } from '../agent/runtime/HttpAgentRuntimeGateway'
import { AgentDrawer } from '../components/agent/AgentDrawer'
import { LearningBookPage } from '../components/learning/LearningBookPage'
import { AgentLauncher } from '../components/navigation/AgentLauncher'
import { BottomNavigation } from '../components/navigation/BottomNavigation'
import { AppIdentityBar } from '../components/shell/AppIdentityBar'
import { TodayPage } from '../components/today/TodayPage'
import { FixtureLearningRepository } from '../learning/FixtureLearningRepository'
import { HttpLearningRepository } from '../learning/HttpLearningRepository'
import { BookChapter, FeynmanSubmission, LearningBook, QuizSubmission } from '../learning/LearningModels'
import { LearningRepository } from '../learning/LearningRepository'
import { LearningSession } from '../learning/LearningSession'
import { AppDestination } from '../models/AppModels'
import { DataMode, ServerConfig } from '../network/ServerConfig'
import { LociTheme } from '../theme/LociTheme'
import { common } from '@kit.AbilityKit'
import { HarmonySpeechRecognizer } from '../voice/HarmonySpeechRecognizer'
import { HarmonyTextSpeaker } from '../voice/HarmonyTextSpeaker'
import { TextSpeaker } from '../voice/TextSpeaker'
import { VoiceDraftSession } from '../voice/VoiceDraftSession'
import { ReviewDeepLinkTarget } from '../review/ReviewDeepLink'
import { subscribeReviewDeepLink, unsubscribeReviewDeepLink } from '../review/ReviewDeepLinkMailbox'

@ComponentV2
export struct AppRoot {
  private repository: LearningRepository = ServerConfig.DATA_MODE === DataMode.HTTP ?
    new HttpLearningRepository() : new FixtureLearningRepository()
  private session: LearningSession = new LearningSession(this.repository)
  private agentSession: AgentTurnSession = new AgentTurnSession(ServerConfig.DATA_MODE === DataMode.HTTP ?
    new HttpAgentRuntimeGateway() : new FixtureAgentRuntimeGateway())
  private voiceSession: VoiceDraftSession | null = null
  private textSpeaker: TextSpeaker = new TextSpeaker(new HarmonyTextSpeaker())
  private voiceTarget: string = ''
  @Local private activeDestination: AppDestination = AppDestination.TODAY
  @Local private phase: string = 'loading'
  @Local private currentBook: LearningBook | null = null
  @Local private currentChapter: BookChapter | null = null
  @Local private selectedAnswerId: string = ''
  @Local private submitting: boolean = false
  @Local private lastSubmission: QuizSubmission | null = null
  @Local private chapterMastery: number = 0
  @Local private conceptMastery: number = 0
  @Local private errorMessage: string = ''
  @Local private agentVisible: boolean = false
  @Local private agentPhase: AgentTurnPhase = 'idle'
  @Local private agentAnswer: string = ''
  @Local private agentError: string = ''
  @Local private agentCitations: Array<AgentCitation> = []
  @Local private agentActivities: Array<string> = []
  @Local private agentQuestion: AgentQuestion | null = null
  @Local private agentBlockId: string = ''
  @Local private feynmanText: string = ''
  @Local private feynmanSubmitting: boolean = false
  @Local private feynmanSubmission: FeynmanSubmission | null = null
  @Local private feynmanError: string = ''
  @Local private feynmanNextStep: string = ''
  @Local private focusBlockId: string = ''
  @Local private agentDraft: string = '请根据刚才的答题结果，追问我一个问题'
  @Local private voiceRecording: boolean = false
  @Local private voiceError: string = ''
  @Local private speakingBlockId: string = ''

  aboutToAppear(): void {
    const hostContext: common.Context | undefined = this.getUIContext().getHostContext()
    if (hostContext !== undefined) {
      this.voiceSession = new VoiceDraftSession(new HarmonySpeechRecognizer(hostContext as common.UIAbilityContext))
      this.voiceSession.observe((): void => this.syncVoiceSession())
    }
    this.agentSession.observe((): void => this.syncAgentSession())
    this.textSpeaker.observe((): void => {
      if (this.textSpeaker.phase === 'error') {
        this.voiceError = this.textSpeaker.errorMessage
        this.speakingBlockId = ''
      }
    })
    this.reload()
    subscribeReviewDeepLink((target: ReviewDeepLinkTarget | null): void => this.openReviewTarget(target))
  }

  aboutToDisappear(): void {
    unsubscribeReviewDeepLink()
    this.voiceSession?.shutdown()
    this.textSpeaker.shutdown()
  }

  private syncSession(): void {
    this.phase = this.session.phase
    this.currentBook = this.session.currentBook
    this.currentChapter = this.session.currentChapter
    this.selectedAnswerId = this.session.selectedAnswerId
    this.submitting = this.session.submitting
    this.lastSubmission = this.session.lastSubmission
    this.chapterMastery = this.session.chapterMastery
    this.conceptMastery = this.session.conceptMastery
    this.errorMessage = this.session.errorMessage
    this.feynmanText = this.session.feynmanText
    this.feynmanSubmitting = this.session.feynmanSubmitting
    this.feynmanSubmission = this.session.feynmanSubmission
    this.feynmanError = this.session.feynmanError
    this.feynmanNextStep = this.session.feynmanNextStep
    this.focusBlockId = this.session.focusBlockId
  }

  private syncVoiceSession(): void {
    if (this.voiceSession === null) return
    this.voiceRecording = this.voiceSession.phase === 'recording' || this.voiceSession.phase === 'finishing'
    this.voiceError = this.voiceSession.errorMessage
    if (this.voiceTarget === 'agent') {
      this.agentDraft = this.voiceSession.draft
    } else if (this.voiceTarget === 'feynman') {
      this.session.setFeynmanText(this.voiceSession.draft)
      this.syncSession()
    }
  }

  private syncAgentSession(): void {
    this.agentPhase = this.agentSession.phase
    this.agentAnswer = this.agentSession.bodyText
    this.agentError = this.agentSession.errorMessage
    this.agentCitations = this.agentSession.citations.slice()
    this.agentActivities = this.agentSession.activities.slice()
    this.agentQuestion = this.agentSession.pendingQuestion
  }

  private reload(): void {
    this.phase = 'loading'
    this.session.load().then(() => this.syncSession()).catch((error: Error) => {
      this.phase = 'error'
      this.errorMessage = error.message
    })
  }

  private openLearning(): void {
    this.stopSpeaking()
    this.session.openLearning()
    this.activeDestination = AppDestination.LEARNING
    this.syncSession()
  }

  private openReviewTarget(target: ReviewDeepLinkTarget | null): void {
    this.stopSpeaking()
    this.session.openReviewTarget(target).then((opened: boolean): void => {
      this.syncSession()
      this.activeDestination = opened ? AppDestination.LEARNING : AppDestination.TODAY
    }).catch((): void => {
      this.session.openToday()
      this.syncSession()
      this.activeDestination = AppDestination.TODAY
    })
  }

  private startVoice(target: string, draft: string): void {
    if (this.voiceSession === null) {
      this.voiceError = '语音服务暂不可用，请继续使用文字输入。'
      return
    }
    this.voiceTarget = target
    this.voiceSession.press(draft)
    this.syncVoiceSession()
  }

  private finishVoice(): void {
    this.voiceSession?.release()
    this.syncVoiceSession()
  }

  private cancelVoice(): void {
    this.voiceSession?.cancel()
    this.syncVoiceSession()
  }

  private speakText(blockId: string, text: string): void {
    this.textSpeaker.speak(text).then((): void => {
      this.speakingBlockId = this.textSpeaker.phase === 'speaking' ? blockId : ''
      if (this.textSpeaker.errorMessage.length > 0) this.voiceError = this.textSpeaker.errorMessage
    }).catch((): void => {
      this.speakingBlockId = ''
      this.voiceError = '朗读暂不可用，请继续阅读文字内容。'
    })
  }

  private stopSpeaking(): void {
    this.textSpeaker.stop()
    this.speakingBlockId = ''
  }

  private submitQuiz(): void {
    this.session.submitCurrentQuiz().then(() => this.syncSession()).catch((error: Error) => {
      this.errorMessage = error.message
    })
    this.submitting = true
  }

  private openAgent(blockId: string = ''): void {
    const learningBlockId: string = this.activeDestination === AppDestination.LEARNING ?
      (this.session.currentQuiz()?.id ?? '') : ''
    this.agentBlockId = blockId.length > 0 ? blockId : learningBlockId
    this.agentVisible = true
  }

  private closeAgent(): void {
    this.agentVisible = false
    setTimeout((): void => {
      focusControl.requestFocus('agent-launcher')
    }, 0)
  }

  private askAgent(question: string): void {
    const request = new AgentTurnRequest(question, this.activeDestination,
      this.currentBook?.id ?? '', this.currentChapter?.id ?? '', this.agentBlockId)
    this.agentSession.start(request)
    this.syncAgentSession()
  }

  private answerAgent(answer: string): void {
    this.agentSession.answer(answer)
    this.syncAgentSession()
  }

  private submitFeynman(): void {
    this.session.submitFeynman().then(() => this.syncSession()).catch(() => this.syncSession())
    this.feynmanSubmitting = true
  }

  @Builder
  private libraryPlaceholder() {
    Column({ space: 12 }) {
      Text('知识库').fontSize(36).fontWeight(FontWeight.Medium).fontColor(LociTheme.TEXT_DARK)
      Text('本轮只迁移互动学习书纵向闭环。').fontSize(15).fontColor(LociTheme.TEXT_DARK_MUTED)
    }.width('100%').height('100%').padding({ left: 24, right: 24, top: 130 })
      .alignItems(HorizontalAlign.Start).backgroundColor(LociTheme.CONTENT_SURFACE)
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      if (this.activeDestination === AppDestination.TODAY) {
        TodayPage({ phase: this.phase, bookTitle: this.currentBook?.title ?? '',
          chapterTitle: this.currentChapter?.title ?? '', errorMessage: this.errorMessage,
          dataModeLabel: ServerConfig.DATA_MODE === DataMode.HTTP ? 'HTTP 服务' : 'FIXTURE 演示数据',
          onContinue: (): void => this.openLearning(), onRetry: (): void => this.reload() })
      } else if (this.activeDestination === AppDestination.LEARNING && this.currentBook !== null && this.currentChapter !== null) {
        LearningBookPage({ bookTitle: this.currentBook.title, chapter: this.currentChapter,
          selectedAnswerId: this.selectedAnswerId, submitting: this.submitting,
          lastSubmission: this.lastSubmission, chapterMastery: this.chapterMastery,
          conceptMastery: this.conceptMastery, errorMessage: this.errorMessage,
          feynmanText: this.feynmanText, feynmanSubmitting: this.feynmanSubmitting,
          feynmanSubmission: this.feynmanSubmission, feynmanError: this.feynmanError,
          feynmanNextStep: this.feynmanNextStep,
          focusBlockId: this.focusBlockId, voiceRecording: this.voiceRecording,
          voiceError: this.voiceTarget === 'feynman' ? this.voiceError : '',
          speakingBlockId: this.speakingBlockId,
          onSelectAnswer: (answerId: string): void => {
            this.session.selectAnswer(answerId)
            this.syncSession()
          },
          onSubmitQuiz: (): void => this.submitQuiz(),
          onAskAgent: (blockId: string): void => this.openAgent(blockId),
          onFeynmanChange: (value: string): void => {
            this.session.setFeynmanText(value)
            this.syncSession()
          },
          onSubmitFeynman: (): void => this.submitFeynman(),
          onVoicePress: (): void => this.startVoice('feynman', this.feynmanText),
          onVoiceRelease: (): void => this.finishVoice(),
          onVoiceCancel: (): void => this.cancelVoice(),
          onSpeakText: (blockId: string, text: string): void => this.speakText(blockId, text),
          onStopSpeaking: (): void => this.stopSpeaking() })
      } else {
        this.libraryPlaceholder()
      }

      Column() { AppIdentityBar(); Blank() }
        .width('100%').height('100%').padding({ top: 18 }).hitTestBehavior(HitTestMode.None)

      Row({ space: 10 }) {
        BottomNavigation({ activeDestination: this.activeDestination,
          onSelect: (destination: AppDestination): void => {
            this.stopSpeaking()
            this.activeDestination = destination
          } }).layoutWeight(1)
        AgentLauncher({ onLaunch: (): void => {
          this.openAgent()
        } })
      }.width('100%').padding({ left: 18, right: 18, bottom: 16 }).alignItems(VerticalAlign.Bottom)

      if (this.agentVisible) {
        Column() {
          Blank().layoutWeight(1).width('100%').onClick(() => {
            this.closeAgent()
          })
          AgentDrawer({ answer: this.agentAnswer, phase: this.agentPhase,
            citations: this.agentCitations, activities: this.agentActivities,
            pendingQuestion: this.agentQuestion, errorMessage: this.agentError,
            dataModeLabel: this.agentSession.dataModeLabel, draft: this.agentDraft,
            voiceRecording: this.voiceTarget === 'agent' && this.voiceRecording,
            voiceError: this.voiceTarget === 'agent' ? this.voiceError : '',
            speaking: this.speakingBlockId === 'agent-answer', onClose: (): void => {
              this.closeAgent()
            },
            onSend: (question: string): void => this.askAgent(question),
            onAnswer: (answer: string): void => this.answerAgent(answer),
            onRetry: (): void => {
              this.agentSession.retry()
              this.syncAgentSession()
            },
            onCancel: (): void => {
              this.agentSession.cancel()
              this.syncAgentSession()
            },
            onDraftChange: (value: string): void => {
              this.agentDraft = value
            },
            onVoicePress: (): void => this.startVoice('agent', this.agentDraft),
            onVoiceRelease: (): void => this.finishVoice(),
            onVoiceCancel: (): void => this.cancelVoice(),
            onSpeakAnswer: (): void => this.speakText('agent-answer', this.agentAnswer),
            onStopSpeaking: (): void => this.stopSpeaking() })
        }.width('100%').height('100%').backgroundColor('#55000000')
      }
    }
    .width('100%').height('100%')
    .linearGradient({ angle: 180, colors: [[LociTheme.CANVAS_TOP, 0.0], [LociTheme.CANVAS_MIDDLE, 0.52], [LociTheme.CANVAS_BOTTOM, 1.0]] })
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
