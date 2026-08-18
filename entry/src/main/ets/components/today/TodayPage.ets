import { LociTheme } from '../../theme/LociTheme'
import { LociIcon, LociIconName } from '../icons/LociIcon'

@ComponentV2
export struct TodayPage {
  @Param phase: string = 'loading'
  @Param bookTitle: string = ''
  @Param chapterTitle: string = ''
  @Param errorMessage: string = ''
  @Param dataModeLabel: string = '演示数据'
  @Event onContinue: () => void = (): void => {}
  @Event onRetry: () => void = (): void => {}

  @Builder
  private learningCard() {
    Column() {
      Row() {
        Text('今日学习').fontSize(11).fontColor(LociTheme.TEXT_SECONDARY)
        Blank()
        Text(this.dataModeLabel).fontSize(10).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_PRIMARY)
          .padding({ left: 10, right: 10, top: 7, bottom: 7 })
          .backgroundColor(LociTheme.PEACH_SOFT).borderRadius(14)
      }.width('100%')

      Text(this.chapterTitle).fontSize(LociTheme.TITLE_SIZE).fontWeight(FontWeight.Medium)
        .fontColor(LociTheme.TEXT_PRIMARY).lineHeight(34).width('100%').margin({ top: 24 })
      Text('完成一个 Quiz，查看掌握度变化，再让 Agent 用追问帮你说清楚。')
        .fontSize(12).fontColor(LociTheme.TEXT_SECONDARY).lineHeight(19)
        .width('100%').margin({ top: 10 })
      Blank()

      Row({ space: 12 }) {
        Stack() {
          Circle().width(42).height(42).fill(LociTheme.PEACH_SOFT)
          LociIcon({ name: LociIconName.DOCUMENT, iconSize: 19, color: LociTheme.TEXT_PRIMARY })
        }
        Column({ space: 4 }) {
          Text(this.bookTitle).fontSize(12).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_PRIMARY)
          Text('活动章节').fontSize(10).fontColor(LociTheme.TEXT_SECONDARY)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('继续').fontSize(12).fontWeight(FontWeight.Bold).fontColor(LociTheme.TEXT_DARK)
          .height(44).padding({ left: 18, right: 18 }).backgroundColor(LociTheme.CONTENT_SURFACE)
          .borderRadius(15).onClick(() => this.onContinue())
      }
      .width('100%').padding(9).backgroundColor(LociTheme.SMOKE_SESSION).borderRadius(19)
    }
    .width('100%').height(306).padding(22)
    .linearGradient({ angle: 146, colors: [[LociTheme.SMOKE_FOCUS_TOP, 0.0], [LociTheme.SMOKE_FOCUS_BOTTOM, 1.0]] })
    .borderRadius(LociTheme.FOCUS_RADIUS).border({ width: 1, color: LociTheme.HAIRLINE_BRIGHT })
    .shadow({ radius: 24, color: LociTheme.SHADOW, offsetY: 10 })
  }

  build() {
    Scroll() {
      Column({ space: 24 }) {
        Text('今日').fontSize(LociTheme.DISPLAY_SIZE).fontWeight(FontWeight.Medium)
          .fontColor(LociTheme.TEXT_PRIMARY).width('100%')

        if (this.phase === 'ready') {
          this.learningCard()
        } else if (this.phase === 'loading') {
          Text('正在整理今天的学习入口…').fontSize(15).fontColor(LociTheme.TEXT_SECONDARY)
            .width('100%').padding(24).backgroundColor(LociTheme.SMOKE_LOW_FALLBACK).borderRadius(24)
        } else if (this.phase === 'empty') {
          Text('暂无可继续的学习书').fontSize(17).fontColor(LociTheme.TEXT_PRIMARY)
            .width('100%').padding(24).backgroundColor(LociTheme.SMOKE_LOW_FALLBACK).borderRadius(24)
        } else {
          Column({ space: 14 }) {
            Text('学习书暂时加载失败').fontSize(17).fontColor(LociTheme.TEXT_PRIMARY)
            Text(this.errorMessage).fontSize(11).fontColor(LociTheme.TEXT_SECONDARY)
            Button('重试').onClick(() => this.onRetry())
          }.width('100%').alignItems(HorizontalAlign.Start).padding(24)
            .backgroundColor(LociTheme.SMOKE_LOW_FALLBACK).borderRadius(24)
        }
      }
      .width('100%').padding({ left: LociTheme.PAGE_SIDE, right: LociTheme.PAGE_SIDE, top: 112, bottom: 140 })
    }
    .width('100%').height('100%').scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
  }
}
