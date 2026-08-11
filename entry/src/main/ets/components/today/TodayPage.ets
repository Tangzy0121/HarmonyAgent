import { TODAY_ACTIONS, TODAY_DATE_LABEL, TODAY_FOCUS, TODAY_TITLE } from '../../data/TodayFixtures'
import { TodayActionItem } from '../../models/AppModels'
import { LociTheme } from '../../theme/LociTheme'

@ComponentV2
export struct TodayPage {
  @Event onContinue: () => void = (): void => {}

  @Builder
  private focusTag(label: string) {
    Text(label)
      .fontSize(10)
      .fontWeight(FontWeight.Medium)
      .fontColor(LociTheme.TEXT_SECONDARY)
      .height(28)
      .padding({ left: 10, right: 10 })
      .backgroundColor(LociTheme.SMOKE_TAG)
      .border({ width: 1, color: LociTheme.HAIRLINE_LIGHT })
      .borderRadius(14)
  }

  @Builder
  private focusTitle() {
    Column({ space: 0 }) {
      Text('分清监督学习')
        .fontSize(LociTheme.TITLE_SIZE)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTheme.TEXT_PRIMARY)
        .lineHeight(29)
        .letterSpacing(-1.15)
      Text('与无监督学习')
        .fontSize(LociTheme.TITLE_SIZE)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTheme.TEXT_PRIMARY)
        .lineHeight(29)
        .letterSpacing(-1.15)
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  private focusSession() {
    Row({ space: 10 }) {
      Stack() {
        Rect()
          .width(40)
          .height(40)
          .radius(13)
          .fill(LociTheme.PEACH_SURFACE)
          .stroke(LociTheme.PEACH_SOFT)
          .strokeWidth(1)
        Image($r('app.media.icon_document_light'))
          .width(18)
          .height(18)
          .objectFit(ImageFit.Contain)
      }
      .width(40)
      .height(40)

      Column({ space: 3 }) {
        Text(TODAY_FOCUS.source)
          .fontSize(11)
          .fontWeight(FontWeight.Bold)
          .fontColor(LociTheme.TEXT_PRIMARY)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(TODAY_FOCUS.position)
          .fontSize(9)
          .fontColor(LociTheme.TEXT_SECONDARY)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)

      Button({ type: ButtonType.Normal, stateEffect: true }) {
        Row({ space: 7 }) {
          Text(TODAY_FOCUS.actionLabel)
            .fontSize(11)
            .fontWeight(FontWeight.Bold)
            .fontColor(LociTheme.TEXT_DARK)
          Image($r('app.media.icon_arrow_dark'))
            .width(15)
            .height(15)
            .objectFit(ImageFit.Contain)
        }
      }
      .height(44)
      .padding({ left: 14, right: 13 })
      .backgroundColor(LociTheme.CONTENT_SURFACE)
      .borderRadius(15)
      .shadow({ radius: 12, color: LociTheme.SHADOW_SOFT, offsetY: 6 })
      .onClick(() => {
        this.onContinue()
      })
    }
    .width('100%')
    .height(58)
    .padding(7)
    .backgroundColor(LociTheme.SMOKE_SESSION)
    .border({ width: 1, color: LociTheme.HAIRLINE_LIGHT })
    .borderRadius(19)
  }

  @Builder
  private actionRow(item: TodayActionItem) {
    Button({ type: ButtonType.Normal, stateEffect: true }) {
      Row({ space: 12 }) {
        Stack() {
          Circle()
            .width(40)
            .height(40)
            .fill(LociTheme.PEACH_SOFT)
          if (item.id === 'review-signal') {
            Image($r('app.media.icon_clock_light'))
              .width(18)
              .height(18)
              .objectFit(ImageFit.Contain)
              .opacity(0.76)
          } else {
            Image($r('app.media.icon_link_light'))
              .width(18)
              .height(18)
              .objectFit(ImageFit.Contain)
              .opacity(0.76)
          }
        }
        .width(40)
        .height(40)

        Column({ space: 4 }) {
          Text(item.eyebrow)
            .fontSize(10)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTheme.TEXT_SECONDARY)
          Text(item.title)
            .fontSize(13)
            .fontWeight(FontWeight.Bold)
            .fontColor(LociTheme.TEXT_PRIMARY)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)

        Text(item.meta)
          .fontSize(10)
          .fontColor(LociTheme.TEXT_SECONDARY)
          .maxLines(1)
          .constraintSize({ maxWidth: 96 })
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        Image($r('app.media.icon_arrow_light'))
          .width(17)
          .height(17)
          .objectFit(ImageFit.Contain)
          .opacity(0.5)
      }
      .width('100%')
      .height(76)
    }
    .width('100%')
    .height(76)
    .padding(0)
    .backgroundColor(Color.Transparent)
    .borderRadius(0)
  }

  build() {
    Scroll() {
      Column() {
        Column({ space: 10 }) {
          Text(TODAY_TITLE)
            .fontSize(LociTheme.DISPLAY_SIZE)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTheme.TEXT_PRIMARY)
            .lineHeight(62)
            .letterSpacing(-3.2)
          Text(TODAY_DATE_LABEL)
            .fontSize(11)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTheme.TEXT_SECONDARY)
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)

        Column() {
          Row() {
            Text(TODAY_FOCUS.label)
              .fontSize(11)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTheme.TEXT_SECONDARY)
            Blank()
            Text(TODAY_FOCUS.status)
              .fontSize(10)
              .fontWeight(FontWeight.Bold)
              .fontColor(LociTheme.TEXT_PRIMARY)
              .height(28)
              .padding({ left: 10, right: 10 })
              .backgroundColor(LociTheme.PEACH_SOFT)
              .border({ width: 1, color: LociTheme.HAIRLINE_LIGHT })
              .borderRadius(14)
          }
          .width('100%')

          Column({ space: 0 }) {
            this.focusTitle()

            Text(TODAY_FOCUS.summary)
              .width('100%')
              .fontSize(11)
              .fontColor(LociTheme.TEXT_SECONDARY)
              .lineHeight(17)
              .margin({ top: 8 })

            Row({ space: 7 }) {
              ForEach(TODAY_FOCUS.tags, (tag: string) => {
                this.focusTag(tag)
              })
            }
            .width('100%')
            .margin({ top: 15 })
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .margin({ top: 19 })

          Blank()

          this.focusSession()
        }
        .width('100%')
        .height(296)
        .margin({ top: 30 })
        .padding(20)
        .linearGradient({
          angle: 146,
          colors: [
            [LociTheme.SMOKE_FOCUS_TOP, 0.0],
            [LociTheme.SMOKE_FOCUS_BOTTOM, 1.0]
          ]
        })
        .borderRadius(LociTheme.FOCUS_RADIUS)
        .border({ width: 1, color: LociTheme.HAIRLINE_BRIGHT })
        .shadow({ radius: 24, color: LociTheme.SHADOW, offsetY: 10 })

        Column({ space: 0 }) {
          Row() {
            Text('其他可做')
              .fontSize(17)
              .fontWeight(FontWeight.Bold)
              .fontColor(LociTheme.TEXT_PRIMARY)
              .letterSpacing(-0.5)
            Blank()
            Text(`${TODAY_ACTIONS.length} 项`)
              .fontSize(10)
              .fontColor(LociTheme.TEXT_SECONDARY)
          }
          .width('100%')
          .margin({ bottom: 12 })

          Divider().color(LociTheme.HAIRLINE_LIGHT)
          ForEach(TODAY_ACTIONS, (item: TodayActionItem) => {
            this.actionRow(item)
            Divider().color(LociTheme.HAIRLINE_LIGHT)
          }, (item: TodayActionItem) => item.id)
        }
        .width('100%')
        .margin({ top: 38 })
      }
      .width('100%')
      .padding({
        left: LociTheme.PAGE_SIDE,
        right: LociTheme.PAGE_SIDE,
        top: 112,
        bottom: 132
      })
    }
    .width('100%')
    .height('100%')
    .scrollBar(BarState.Off)
    .edgeEffect(EdgeEffect.Spring)
  }
}
