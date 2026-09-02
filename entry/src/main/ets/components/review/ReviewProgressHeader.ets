import { LociTokens } from '../../theme/LociTokens'

/** 短复习进度头；由父页面管理队列和流程状态。 */
@ComponentV2
export struct ReviewProgressHeader {
  @Param current: number = 0
  @Param total: number = 0
  @Param done: boolean = false

  build() {
    Row() {
      Column({ space: 6 }) {
        Text('有限任务 · 随时可以退出')
          .fontSize(LociTokens.FONT_LABEL)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text(this.done ? '这次复习已经完成' : `${this.current + 1} / ${this.total}`)
          .fontSize(LociTokens.FONT_DISPLAY_REVIEW)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .letterSpacing(-1.5)
          .width('100%')
          .accessibilityText(this.done ? '这次复习已经完成' :
            `第 ${this.current + 1} 项,共 ${this.total} 项`)
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      Stack() {
        Rect().width(64).height(1).fill(LociTokens.LINE_STRONG)
        Rect()
          .width(this.total === 0 ? 0 : 64 * Math.min(this.current, this.total) / this.total)
          .height(1)
          .fill(LociTokens.INK)
      }
      .width(64)
      .height(24)
      .alignContent(Alignment.Start)
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_5 })
    .padding({ bottom: LociTokens.SPACE_5 })
    .border({ width: { bottom: 1 }, color: LociTokens.LINE })
  }
}
