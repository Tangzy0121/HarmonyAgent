/**
 * 一级页顶栏:左上角两条不等长细线(打开全屏文字导航),右上角 loci 标志。
 * 真源:prototype/src/components/shell/MobileIdentity.tsx 的 .mobile-identity
 * (触发区 52×44,细线 36×2 / 22×2、间距 7,ink 色)。
 * 纪律:无底部导航、无悬浮 Agent 入口(docs/product/03 §2.1)。
 */
import { LociTokens } from '../../theme/LociTokens'
import { LociBrand } from './LociBrand'

@ComponentV2
export struct LociIdentityBar {
  @Event onOpenMenu: () => void = (): void => {}

  build() {
    Row() {
      Column({ space: 7 }) {
        Rect().width(36).height(2).fill(LociTokens.INK)
        Rect().width(22).height(2).fill(LociTokens.INK)
      }
      .width(52)
      .height(LociTokens.CONTROL_MIN)
      .alignItems(HorizontalAlign.Start)
      .justifyContent(FlexAlign.Center)
      .accessibilityText('打开导航')
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => this.onOpenMenu())

      Blank()

      LociBrand({ markSize: 20, inkColor: LociTokens.INK })
    }
    .width('100%')
    .height(LociTokens.CONTROL_MIN)
    .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X })
  }
}
