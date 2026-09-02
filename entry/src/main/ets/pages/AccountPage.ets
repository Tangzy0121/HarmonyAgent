/** 一级账户页。当前版本只展示本地演示身份与同步边界。 */
import { LociTokens } from '../theme/LociTokens'

@ComponentV2
export struct AccountPage {
  @Builder
  private factRow(label: string, value: string) {
    Row() {
      Text(label)
        .fontSize(LociTokens.FONT_LABEL)
        .fontColor(LociTokens.INK_MUTED)
      Blank()
      Text(value)
        .fontSize(LociTokens.FONT_META)
        .fontColor(LociTokens.INK)
    }
    .width('100%')
    .height(58)
    .border({ width: { bottom: 1 }, color: LociTokens.LINE })
  }

  build() {
    Scroll() {
      Column() {
        Text('身份')
          .fontSize(LociTokens.FONT_LABEL)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text('账户')
          .fontSize(LociTokens.FONT_DISPLAY)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .letterSpacing(-2)
          .width('100%')
          .margin({ top: 12 })
        Text('查看当前原型身份与同步状态。')
          .fontSize(LociTokens.FONT_META)
          .fontColor(LociTokens.INK_SOFT)
          .lineHeight(21)
          .width('100%')
          .margin({ top: 18 })

        Row({ space: 16 }) {
          Stack() {
            Text('L')
              .fontSize(LociTokens.FONT_CONTROL)
              .fontColor(LociTokens.INK)
          }
          .width(54)
          .height(54)
          .border({ width: 1, color: LociTokens.LINE_STRONG })
          .borderRadius(27)

          Column({ space: 7 }) {
            Text('本地演示账户')
              .fontSize(LociTokens.FONT_CONTROL)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTokens.INK)
            Text('用于体验学习流程，不连接真实账户服务。')
              .fontSize(LociTokens.FONT_CAPTION)
              .fontColor(LociTokens.INK_MUTED)
              .lineHeight(16)
          }
          .alignItems(HorizontalAlign.Start)
          .layoutWeight(1)
        }
        .width('100%')
        .padding({ top: 22, bottom: 22 })
        .margin({ top: 60 })
        .border({ width: { top: 1, bottom: 1 }, color: LociTokens.LINE })

        Column() {
          this.factRow('账户状态', '本地原型')
          this.factRow('学习记录', '当前会话')
          this.factRow('跨设备同步', '未连接')
        }
        .width('100%')
        .margin({ top: 48 })
        .border({ width: { top: 1 }, color: LociTokens.LINE })

        Text('正式版本将在这里提供登录、资料同步与账户安全管理。')
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
          .lineHeight(17)
          .width('100%')
          .margin({ top: 32 })
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 118, bottom: 100 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(LociTokens.SCREEN)
    .scrollBar(BarState.Off)
  }
}
