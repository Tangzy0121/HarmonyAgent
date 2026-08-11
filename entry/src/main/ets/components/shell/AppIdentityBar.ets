import { BlossomMark } from '../brand/BlossomMark'
import { LociTheme } from '../../theme/LociTheme'

@ComponentV2
export struct AppIdentityBar {
  build() {
    Row() {
      Row({ space: 9 }) {
        BlossomMark({
          markSize: 18,
          petalColor: LociTheme.TEXT_PRIMARY,
          centerColor: LociTheme.PEACH
        })
        Text('loci')
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor(LociTheme.TEXT_PRIMARY)
          .letterSpacing(-0.4)
      }

      Blank()

      Button({ type: ButtonType.Capsule, stateEffect: true }) {
        Row({ space: 9 }) {
          Text('Profile')
            .fontSize(12)
            .fontWeight(FontWeight.Bold)
            .fontColor(LociTheme.TEXT_PRIMARY)
          Stack() {
            Circle()
              .width(36)
              .height(36)
              .fill(LociTheme.SMOKE_LOW_FALLBACK)
              .stroke(LociTheme.SMOKE_INNER_EDGE)
              .strokeWidth(1)
            Circle()
              .width(7)
              .height(7)
              .fill(LociTheme.TEXT_PRIMARY)
              .translate({ y: -5 })
            Rect()
              .width(13)
              .height(7)
              .radius(4)
              .fill(LociTheme.TEXT_PRIMARY)
              .translate({ y: 6 })
          }
          .width(36)
          .height(36)
        }
        .height(LociTheme.CONTROL_MIN)
        .padding({ left: 14, right: 4 })
      }
      .height(LociTheme.CONTROL_MIN)
      .padding(0)
      .backgroundColor(LociTheme.SMOKE_PROFILE)
      .backgroundBlurStyle(BlurStyle.Thin)
      .borderRadius(22)
      .border({ width: 1, color: LociTheme.SMOKE_INNER_EDGE })
      .clip(true)
    }
    .width('100%')
    .height(44)
    .padding({ left: LociTheme.PAGE_SIDE, right: LociTheme.PAGE_SIDE })
  }
}
