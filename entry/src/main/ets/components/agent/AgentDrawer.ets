import { LociTheme } from '../../theme/LociTheme'
import { BlossomMark } from '../brand/BlossomMark'
import { AgentCitation, AgentQuestion } from '../../agent/runtime/AgentEventParser'
import { AgentTurnPhase } from '../../agent/runtime/AgentTurnSession'
import {
  AgentDrawerState,
  agentCitationKey,
  agentOptionMinHeight,
  buildAgentDrawerState
} from './AgentDrawerState'

@ComponentV2
export struct AgentDrawer {
  @Param answer: string = ''
  @Param phase: AgentTurnPhase = 'idle'
  @Param citations: Array<AgentCitation> = []
  @Param activities: Array<string> = []
  @Param pendingQuestion: AgentQuestion | null = null
  @Param errorMessage: string = ''
  @Param dataModeLabel: string = ''
  @Param draft: string = '请根据刚才的答题结果，追问我一个问题'
  @Param voiceRecording: boolean = false
  @Param voiceError: string = ''
  @Param speaking: boolean = false
  @Local private answerDraft: string = ''
  @Event onClose: () => void = (): void => {}
  @Event onSend: (question: string) => void = (question: string): void => {}
  @Event onAnswer: (answer: string) => void = (answer: string): void => {}
  @Event onRetry: () => void = (): void => {}
  @Event onCancel: () => void = (): void => {}
  @Event onDraftChange: (value: string) => void = (value: string): void => {}
  @Event onVoicePress: () => void = (): void => {}
  @Event onVoiceRelease: () => void = (): void => {}
  @Event onVoiceCancel: () => void = (): void => {}
  @Event onSpeakAnswer: () => void = (): void => {}
  @Event onStopSpeaking: () => void = (): void => {}

  private isActive(): boolean {
    return this.viewState().showCancel
  }

  private viewState(): AgentDrawerState {
    return buildAgentDrawerState(this.phase, this.answer, this.citations, this.activities,
      this.pendingQuestion, this.errorMessage)
  }

  build() {
    Column({ space: 16 }) {
      Row({ space: 10 }) {
        BlossomMark({ markSize: 22, petalColor: LociTheme.TEXT_DARK, centerColor: LociTheme.PEACH })
        Text('学习 Agent').fontSize(18).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
        Text(this.dataModeLabel).fontSize(10).fontColor(LociTheme.TEXT_DARK_MUTED)
        Blank()
        Button('关闭').fontSize(11).onClick(() => this.onClose())
      }.width('100%')

      Scroll() {
        Column({ space: 12 }) {
          Text(this.answer.length > 0 ? this.answer : '我会结合当前章节和最近一次答题，用追问帮你澄清。')
            .fontSize(14).fontColor(LociTheme.TEXT_DARK_MUTED).lineHeight(23).width('100%')
            .padding(16).backgroundColor(LociTheme.CONTENT_SURFACE_ALT).borderRadius(18)

          if (this.answer.length > 0) {
            Button(this.speaking ? '停止朗读' : '朗读回答').height(36).fontSize(11)
              .onClick(() => this.speaking ? this.onStopSpeaking() : this.onSpeakAnswer())
          }

          if (this.activities.length > 0) {
            Text(this.activities[this.activities.length - 1]).fontSize(11)
              .fontColor(LociTheme.TEXT_DARK_MUTED).width('100%')
          }

          if (this.citations.length > 0) {
            Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
              ForEach(this.citations, (citation: AgentCitation) => {
                Text(citation.label).fontSize(10).fontColor(LociTheme.TEXT_DARK)
                  .margin({ right: 8, bottom: 8 })
                  .padding({ left: 10, right: 10, top: 6, bottom: 6 })
                  .backgroundColor(LociTheme.CONTENT_SURFACE_ALT).borderRadius(12)
              }, (citation: AgentCitation) => agentCitationKey(citation))
            }.width('100%')
          }

          if (this.pendingQuestion !== null) {
            Column({ space: 9 }) {
              Text(this.pendingQuestion.prompt).fontSize(13).fontWeight(FontWeight.Bold)
                .fontColor(LociTheme.TEXT_DARK).width('100%')
              ForEach(this.pendingQuestion.options, (option: string) => {
                Button() {
                  Text(option).fontSize(13).fontColor(LociTheme.TEXT_DARK).width('100%')
                    .textAlign(TextAlign.Center)
                }
                .width('100%').constraintSize({ minHeight: agentOptionMinHeight(option) })
                .padding({ left: 12, right: 12, top: 10, bottom: 10 })
                .backgroundColor(LociTheme.CONTENT_SURFACE_ALT).borderRadius(13)
                .onClick(() => this.onAnswer(option))
              }, (option: string) => option)
              if (this.pendingQuestion.allowFreeText) {
                Row({ space: 8 }) {
                  TextInput({ text: this.answerDraft, placeholder: '也可以自由回答' }).layoutWeight(1)
                    .height(42).backgroundColor(LociTheme.CONTENT_SURFACE_ALT).borderRadius(13)
                    .onChange((value: string) => this.answerDraft = value)
                  Button('回答').height(42).enabled(this.answerDraft.trim().length > 0)
                    .onClick(() => this.onAnswer(this.answerDraft.trim()))
                }.width('100%')
              }
            }.width('100%').alignItems(HorizontalAlign.Start).padding(14)
              .backgroundColor('#FFF7F1').borderRadius(16)
          }

          if (this.viewState().errorMessage.length > 0) {
            Text(this.viewState().errorMessage).fontSize(11).fontColor('#FF9B5143').width('100%')
            if (this.viewState().showRetry) {
              Button('重试').width('100%').height(42).onClick(() => this.onRetry())
            }
          }
        }.width('100%').alignItems(HorizontalAlign.Start)
      }
      .width('100%').layoutWeight(1).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)

      if (this.pendingQuestion === null) {
        TextInput({ text: this.draft, placeholder: '向 Agent 提问' })
          .height(48).backgroundColor(LociTheme.CONTENT_SURFACE_ALT).borderRadius(16)
          .onChange((value: string) => this.onDraftChange(value))
        if (this.voiceError.length > 0) {
          Text(this.voiceError).fontSize(11).fontColor('#FF9B5143').width('100%')
        }
        Row({ space: 10 }) {
          Button(this.voiceRecording ? '松开完成' : '按住说话').height(48)
            .backgroundColor(this.voiceRecording ? LociTheme.PEACH : LociTheme.CONTENT_SURFACE_ALT)
            .fontColor(LociTheme.TEXT_DARK).borderRadius(16)
            .onTouch((event: TouchEvent): void => {
              if (event.type === TouchType.Down) this.onVoicePress()
              if (event.type === TouchType.Up) this.onVoiceRelease()
              if (event.type === TouchType.Cancel) this.onVoiceCancel()
            })
          if (this.isActive()) {
            Button('取消').layoutWeight(1).height(48).backgroundColor(LociTheme.CONTENT_SURFACE_ALT)
              .fontColor(LociTheme.TEXT_DARK).borderRadius(16).onClick(() => this.onCancel())
          }
          Button(this.isActive() ? '学习中…' : '发送').layoutWeight(1).height(48)
            .enabled(!this.isActive() && this.draft.trim().length > 0)
            .backgroundColor(LociTheme.TEXT_DARK).fontColor(LociTheme.TEXT_PRIMARY).borderRadius(16)
            .onClick(() => this.onSend(this.draft.trim()))
        }.width('100%')
      } else {
        Button('取消本轮').width('100%').height(44).backgroundColor(LociTheme.CONTENT_SURFACE_ALT)
          .fontColor(LociTheme.TEXT_DARK).onClick(() => this.onCancel())
      }
    }
    .width('100%').height('75%').padding({ left: 22, right: 22, top: 20, bottom: 30 })
    .backgroundColor(LociTheme.CONTENT_SURFACE).borderRadius({ topLeft: 30, topRight: 30 })
    .shadow({ radius: 26, color: LociTheme.SHADOW, offsetY: -5 })
  }
}
