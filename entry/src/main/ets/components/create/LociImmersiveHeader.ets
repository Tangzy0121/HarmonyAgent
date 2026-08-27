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
    // 三段 Row:左返回 / 中标题(layoutWeight 居中) / 右隐藏占位(与左同结构,保证中间真居中)。
    // 旧实现 Stack 直接叠加,窄屏下「← 学习库」与「1/3 新建项目」叠字(M4 遗留 bug,2026-08-27 修)。
    Row() {
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
      .accessibilityText(`返回${this.backLabel}`)
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => this.onBack())

      Column({ space: 2 }) {
        Text(this.meta)
          .fontSize(10)
          .fontColor(LociTokens.INK_MUTED)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.title)
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Center)

      Row({ space: 4 }) {
        Text('←')
          .fontSize(16)
        Text(this.backLabel)
          .fontSize(12)
      }
      .height(LociTokens.CONTROL_MIN)
      .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_3 })
      .visibility(Visibility.Hidden)
      .accessibilityLevel('no')
    }
    .width('100%')
    .height(52)
    .alignItems(VerticalAlign.Center)
  }
}
