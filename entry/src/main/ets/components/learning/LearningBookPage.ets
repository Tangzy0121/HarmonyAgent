import { BookChapter, FeynmanSubmission, LearningBlock, QuizOption, QuizSubmission } from '../../learning/LearningModels'
import { LociTheme } from '../../theme/LociTheme'
import { FeynmanPanel } from './FeynmanPanel'

@ComponentV2
export struct LearningBookPage {
  @Param bookTitle: string = ''
  @Param chapter: BookChapter = new BookChapter('', '', 0, 'pending')
  @Param selectedAnswerId: string = ''
  @Param submitting: boolean = false
  @Param lastSubmission: QuizSubmission | null = null
  @Param chapterMastery: number = 0
  @Param conceptMastery: number = 0
  @Param errorMessage: string = ''
  @Param feynmanText: string = ''
  @Param feynmanSubmitting: boolean = false
  @Param feynmanSubmission: FeynmanSubmission | null = null
  @Param feynmanError: string = ''
  @Param feynmanNextStep: string = ''
  @Param focusBlockId: string = ''
  @Param voiceRecording: boolean = false
  @Param voiceError: string = ''
  @Param speakingBlockId: string = ''
  @Event onSelectAnswer: (answerId: string) => void = (answerId: string): void => {}
  @Event onSubmitQuiz: () => void = (): void => {}
  @Event onAskAgent: (blockId: string) => void = (blockId: string): void => {}
  @Event onFeynmanChange: (value: string) => void = (value: string): void => {}
  @Event onSubmitFeynman: () => void = (): void => {}
  @Event onVoicePress: () => void = (): void => {}
  @Event onVoiceRelease: () => void = (): void => {}
  @Event onVoiceCancel: () => void = (): void => {}
  @Event onSpeakText: (blockId: string, text: string) => void = (blockId: string, text: string): void => {}
  @Event onStopSpeaking: () => void = (): void => {}
  private scroller: Scroller = new Scroller()

  aboutToAppear(): void {
    if (this.focusBlockId.length === 0) return
    for (let index: number = 0; index < this.chapter.blocks.length; index++) {
      if (this.chapter.blocks[index].id === this.focusBlockId) {
        setTimeout((): void => this.scroller.scrollToIndex(index + 2, true), 0)
        return
      }
    }
  }

  @Builder
  private textBlock(block: LearningBlock) {
    Column({ space: 10 }) {
      Text(block.title).fontSize(18).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
      Button(this.speakingBlockId === block.id ? '停止朗读' : '朗读本节').height(34).fontSize(10)
        .onClick(() => {
          if (this.speakingBlockId === block.id) {
            this.onStopSpeaking()
          } else {
            const body: string = block.type === 'explanation' ? `${block.body} ${block.keyPoint}` :
              block.type === 'concept' ? `${block.conceptLabel} ${block.conceptDescription}` :
                `${block.scenario} ${block.takeaway}`
            this.onSpeakText(block.id, `${block.title}。${body}`)
          }
        })
      if (block.type === 'explanation') {
        Text(block.body).fontSize(15).fontColor(LociTheme.TEXT_DARK_MUTED).lineHeight(24)
        Text(block.keyPoint).fontSize(13).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
      } else if (block.type === 'concept') {
        Text(block.conceptLabel).fontSize(15).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
        Text(block.conceptDescription).fontSize(14).fontColor(LociTheme.TEXT_DARK_MUTED).lineHeight(22)
      } else if (block.type === 'example') {
        Text(block.scenario).fontSize(14).fontColor(LociTheme.TEXT_DARK_MUTED).lineHeight(22)
        Text(block.takeaway).fontSize(13).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start).padding(20)
    .backgroundColor(LociTheme.CONTENT_SURFACE).borderRadius(24)
  }

  @Builder
  private optionButton(option: QuizOption) {
    Button({ type: ButtonType.Normal, stateEffect: true }) {
      Row({ space: 12 }) {
        Text(option.marker).fontSize(12).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
          .width(28).height(28).textAlign(TextAlign.Center)
          .backgroundColor(this.selectedAnswerId === option.id ? LociTheme.PEACH : LociTheme.CONTENT_SURFACE_ALT)
          .borderRadius(14)
        Text(option.text).fontSize(13).fontColor(LociTheme.TEXT_DARK).layoutWeight(1)
      }.width('100%')
    }
    .width('100%').height(62).padding({ left: 12, right: 12 })
    .backgroundColor(this.selectedAnswerId === option.id ? '#FFF1EC' : LociTheme.CONTENT_SURFACE)
    .borderRadius(18).onClick(() => this.onSelectAnswer(option.id))
  }

  @Builder
  private quizBlock(block: LearningBlock) {
    Column({ space: 12 }) {
      Text(block.title).fontSize(12).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_SECONDARY)
      Text(block.question).fontSize(18).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_PRIMARY).lineHeight(27)
      ForEach(block.options, (option: QuizOption) => this.optionButton(option), (option: QuizOption) => option.id)
      Button(this.submitting ? '提交中…' : '提交答案').width('100%').height(48)
        .fontColor(LociTheme.TEXT_DARK).backgroundColor(LociTheme.CONTENT_SURFACE).borderRadius(16)
        .enabled(!this.submitting && this.selectedAnswerId.length > 0).onClick(() => this.onSubmitQuiz())

      if (this.lastSubmission !== null) {
        Column({ space: 8 }) {
          Text(this.lastSubmission.isCorrect ? '回答正确' : '继续校准')
            .fontSize(15).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_PRIMARY)
          Text(this.lastSubmission.feedback).fontSize(12).fontColor(LociTheme.TEXT_SECONDARY).lineHeight(19)
          Row() {
            Text(`章节掌握度 ${Math.round(this.chapterMastery * 100)}%`).fontSize(12).fontColor(LociTheme.TEXT_PRIMARY)
            Blank()
            Text(`概念 ${Math.round(this.conceptMastery * 100)}%`).fontSize(12).fontColor(LociTheme.TEXT_PRIMARY)
          }.width('100%')
          Button('让 Agent 追问我').width('100%').onClick(() => this.onAskAgent(block.id))
        }.width('100%').alignItems(HorizontalAlign.Start).padding(16)
          .backgroundColor(LociTheme.SMOKE_LOW_FALLBACK).borderRadius(18)
      }
      if (this.errorMessage.length > 0) {
        Text(this.errorMessage).fontSize(11).fontColor('#FFFFC8C8')
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start).padding(20)
    .backgroundColor(LociTheme.SMOKE_SESSION).borderRadius(26)
  }

  build() {
    Scroll(this.scroller) {
      Column({ space: 16 }) {
        Text(this.bookTitle).fontSize(11).fontColor(LociTheme.TEXT_SECONDARY).width('100%')
        Text(this.chapter.title).fontSize(32).fontWeight(FontWeight.Medium)
          .fontColor(LociTheme.TEXT_PRIMARY).width('100%').lineHeight(40)
        ForEach(this.chapter.blocks, (block: LearningBlock) => {
          if (block.type === 'quiz') {
            this.quizBlock(block)
          } else {
            this.textBlock(block)
          }
        }, (block: LearningBlock) => block.id)
        FeynmanPanel({ text: this.feynmanText, submitting: this.feynmanSubmitting,
          submission: this.feynmanSubmission, errorMessage: this.feynmanError,
          nextStep: this.feynmanNextStep, chapterMastery: this.chapterMastery,
          voiceRecording: this.voiceRecording, voiceError: this.voiceError,
          onChange: (value: string): void => this.onFeynmanChange(value),
          onSubmit: (): void => this.onSubmitFeynman(),
          onAskAgent: (): void => this.onAskAgent(''),
          onVoicePress: (): void => this.onVoicePress(),
          onVoiceRelease: (): void => this.onVoiceRelease(),
          onVoiceCancel: (): void => this.onVoiceCancel() })
      }
      .width('100%').padding({ left: LociTheme.PAGE_SIDE, right: LociTheme.PAGE_SIDE, top: 110, bottom: 150 })
    }
    .width('100%').height('100%').scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
  }
}
