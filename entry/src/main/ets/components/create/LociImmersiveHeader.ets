/**
 * 沉浸页头(创建流 / 方案确认)
 * 真源:prototype/src/components/shell/ImmersiveHeader.tsx。
 * 左侧「← 返回标签」图标文字按钮,中间「步骤 meta + 页面标题」居中,右侧占位保持居中。
 */
import { LociTokens } from '../../theme/LociTokens'

@ComponentV2
export struct LociImmersiveHeader {
  @Param title: string = ''
  @Param meta: string = ''
  @Param backLabel: string = '学习库'
  @Event onBack: () => void = (): void => {}

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column({ space: 2 }) {
        Text(this.meta)
          .fontSize(10)
          .fontColor(LociTokens.INK_MUTED)
        Text(this.title)
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
      }
      .alignItems(HorizontalAlign.Center)

      Row({ space: 4 }) {
        Text('←')
          .fontSize(16)
          .fontColor(LociTokens.INK)
        Text(this.backLabel)
          .fontSize(12)
          .fontColor(LociTokens.INK_SOFT)
      }
      .height(LociTokens.CONTROL_MIN)
      .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_3 })
      .align(Alignment.Start)
      .accessibilityText(`返回${this.backLabel}`)
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => this.onBack())
    }
    .width('100%')
    .height(52)
  }
}
