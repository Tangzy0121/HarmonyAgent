/**
 * 全屏文字导航(M1:今日 / 学习库 / 设置 / 账户)
 * 真源:prototype/src/components/shell/MobileIdentity.tsx 的 .nav-menu
 * (纯黑全屏,顶部关闭 + loci 标志,列表沉底,大字号文字项,当前项带箭头)。
 * 动效纪律:瞬时显隐,不做大动画,天然满足「减少动态」(docs/product/03 §12)。
 */
import { LociTokens } from '../../theme/LociTokens'
import { LociBrand } from './LociBrand'

@ComponentV2
export struct LociMenuOverlay {
  @Param current: string = 'today'
  @Event onNavigate: (name: string) => void = (name: string): void => {}
  @Event onClose: () => void = (): void => {}

  @Builder
  private menuItem(name: string, label: string) {
    Row() {
      Text(label)
        .fontSize(LociTokens.FONT_PAGE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(this.current === name ? LociTokens.INK : LociTokens.INK_MUTED)
        .letterSpacing(-1)
      Blank()
      if (this.current === name) {
        Text('→')
          .fontSize(LociTokens.FONT_SECTION)
          .fontColor(LociTokens.INK)
      }
    }
    .width('100%')
    .height(68)
    .accessibilityRole(AccessibilityRoleType.BUTTON)
    .accessibilityDescription(this.current === name ? `${label},当前页面` : label)
    .onClick((): void => this.onNavigate(name))
  }

  build() {
    Column() {
      Row() {
        Stack() {
          Text('×')
            .fontSize(LociTokens.FONT_ICON)
            .fontWeight(FontWeight.Lighter)
            .fontColor(LociTokens.INK)
        }
        .width(52)
        .height(52)
        .accessibilityText('关闭导航')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onClose())

        Blank()

        LociBrand({ markSize: 20, inkColor: LociTokens.INK })
      }
      .width('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 18 })

      Blank()

      Column() {
        this.menuItem('today', '今日')
        this.menuItem('library', '学习库')
        this.menuItem('settings', '设置')
        this.menuItem('account', '账户')
      }
      .width('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, bottom: LociTokens.SPACE_8 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(LociTokens.SCREEN)
  }
}
