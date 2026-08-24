import { FeynmanSubmission } from '../../learning/LearningModels'
import { LociTheme } from '../../theme/LociTheme'
import {
  FEYNMAN_EFFECTIVE_LIMIT,
  FEYNMAN_RAW_LIMIT,
  FeynmanPanelState,
  buildFeynmanPanelState
} from './FeynmanPanelState'

@ComponentV2
export struct FeynmanPanel {
  @Param text: string = ''
  @Param submitting: boolean = false
  @Param submission: FeynmanSubmission | null = null
  @Param errorMessage: string = ''
  @Param nextStep: string = ''
  @Param chapterMastery: number = 0
  @Param voiceRecording: boolean = false
  @Param voiceError: string = ''
  @Event onChange: (value: string) => void = (value: string): void => {}
  @Event onSubmit: () => void = (): void => {}
  @Event onAskAgent: () => void = (): void => {}
  @Event onVoicePress: () => void = (): void => {}
  @Event onVoiceRelease: () => void = (): void => {}
  @Event onVoiceCancel: () => void = (): void => {}

  private viewState(): FeynmanPanelState {
    return buildFeynmanPanelState(this.text)
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 4 }) {
          Text('费曼复述').fontSize(18).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
          Text('用自己的话讲清本章；只有点击提交才会形成学习证据。')
            .fontSize(11).fontColor(LociTheme.TEXT_DARK_MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Text(`${this.viewState().effectiveLength}/${FEYNMAN_EFFECTIVE_LIMIT}`)
          .fontSize(11).fontColor(LociTheme.TEXT_DARK_MUTED)
      }.width('100%').alignItems(VerticalAlign.Top)

      TextArea({ text: this.text, placeholder: '例如：这一章的核心是……' })
        .width('100%').height(150).maxLength(FEYNMAN_RAW_LIMIT).fontSize(14)
        .backgroundColor(LociTheme.CONTENT_SURFACE_ALT).borderRadius(16)
        .onChange((value: string) => this.onChange(value))

      Row({ space: 8 }) {
        Button(this.voiceRecording ? '松开完成' : '按住说话').height(40)
          .backgroundColor(this.voiceRecording ? LociTheme.PEACH : LociTheme.CONTENT_SURFACE_ALT)
          .fontColor(LociTheme.TEXT_DARK).borderRadius(13)
          .onTouch((event: TouchEvent): void => {
            if (event.type === TouchType.Down) this.onVoicePress()
            if (event.type === TouchType.Up) this.onVoiceRelease()
            if (event.type === TouchType.Cancel) this.onVoiceCancel()
          })
        if (this.voiceError.length > 0) {
          Text(this.voiceError).fontSize(11).fontColor('#FF9B5143').layoutWeight(1)
        }
      }.width('100%')

      Row({ space: 10 }) {
        Button('让 Agent 引导我复述').layoutWeight(1).height(44)
          .fontColor(LociTheme.TEXT_DARK).backgroundColor(LociTheme.CONTENT_SURFACE_ALT)
          .borderRadius(14).onClick(() => this.onAskAgent())
        Button(this.submitting ? '提交中…' : '提交复述').layoutWeight(1).height(44)
          .enabled(!this.submitting && this.viewState().canSubmit)
          .fontColor(LociTheme.TEXT_PRIMARY).backgroundColor(LociTheme.TEXT_DARK)
          .borderRadius(14).onClick(() => this.onSubmit())
      }.width('100%')

      if (this.submission !== null) {
        Column({ space: 7 }) {
          Text(this.submission.passed ? '复述通过' : '再校准一下')
            .fontSize(15).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
          Text(this.submission.feedback).fontSize(12).fontColor(LociTheme.TEXT_DARK_MUTED).lineHeight(19)
          if (this.nextStep.length > 0) {
            Text(this.nextStep).fontSize(12).fontColor(LociTheme.TEXT_DARK).lineHeight(19)
          }
          Row() {
            Text(`章节掌握度 ${Math.round(this.chapterMastery * 100)}%`)
              .fontSize(11).fontColor(LociTheme.TEXT_DARK_MUTED)
            Blank()
            Text(this.submission.projectionStatus === 'pending' ? '掌握度同步中' : '已同步学习证据')
              .fontSize(11).fontColor(LociTheme.TEXT_DARK_MUTED)
          }.width('100%')
        }.width('100%').alignItems(HorizontalAlign.Start).padding(14)
          .backgroundColor(LociTheme.CONTENT_SURFACE_ALT).borderRadius(16)
      }
      if (this.errorMessage.length > 0) {
        Text(this.errorMessage).fontSize(11).fontColor('#FF9B5143').width('100%')
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start).padding(20)
    .backgroundColor(LociTheme.CONTENT_SURFACE).borderRadius(24)
  }
}
