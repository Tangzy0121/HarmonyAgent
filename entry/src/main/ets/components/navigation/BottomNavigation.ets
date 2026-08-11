import { AppDestination } from '../../models/AppModels'
import { LociTheme } from '../../theme/LociTheme'
import { LociIcon, LociIconName } from '../icons/LociIcon'

@ComponentV2
export struct BottomNavigation {
  @Param activeDestination: AppDestination = AppDestination.TODAY
  @Event onSelect: (destination: AppDestination) => void = (destination: AppDestination): void => {}

  @Builder
  private destinationItem(destination: AppDestination, icon: LociIconName, label: string) {
    Button({ type: ButtonType.Normal, stateEffect: true }) {
      Column({ space: 4 }) {
        LociIcon({
          name: icon,
          iconSize: 18,
          color: this.activeDestination === destination ? LociTheme.TEXT_DARK : LociTheme.TEXT_SECONDARY,
          strokeWidth: 1.7
        })
        Text(label)
          .fontSize(10)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.activeDestination === destination ? LociTheme.TEXT_DARK : LociTheme.TEXT_SECONDARY)
      }
      .justifyContent(FlexAlign.Center)
      .width('100%')
      .height('100%')
    }
    .layoutWeight(1)
    .height(54)
    .padding(0)
    .backgroundColor(this.activeDestination === destination ? LociTheme.SMOKE_ACTIVE : Color.Transparent)
    .borderRadius(20)
    .animation({ duration: 200, curve: Curve.EaseOut })
    .onClick(() => {
      this.onSelect(destination)
    })
  }

  build() {
    Row({ space: 2 }) {
      this.destinationItem(AppDestination.TODAY, LociIconName.TODAY, '今日')
      this.destinationItem(AppDestination.LEARNING, LociIconName.LEARNING, '学习')
      this.destinationItem(AppDestination.LIBRARY, LociIconName.LIBRARY, '知识库')
    }
    .width('100%')
    .height(LociTheme.NAV_HEIGHT)
    .padding(5)
    .backgroundColor(LociTheme.SMOKE_NAV)
    .backgroundBlurStyle(BlurStyle.Thin)
    .borderRadius(LociTheme.NAV_RADIUS)
    .border({ width: 1, color: LociTheme.SMOKE_INNER_EDGE })
    .linearGradient({
      angle: 145,
      colors: [
        [LociTheme.SMOKE_HIGHLIGHT, 0.0],
        [Color.Transparent, 0.48],
        [LociTheme.SMOKE_HIGH_FALLBACK, 1.0]
      ]
    })
    .shadow({ radius: 20, color: LociTheme.SHADOW, offsetY: 9 })
  }
}
