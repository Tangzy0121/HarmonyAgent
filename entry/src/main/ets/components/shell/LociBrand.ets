/**
 * loci 品牌标志(五瓣符号 + loci 字标)
 * 真源:prototype/src/components/shell/MobileIdentity.tsx 的 BrandMark
 * (shell.css .brand-mark:五瓣旋转 72°,ink 色,无中心圆点)。
 * 花瓣几何沿用 entry 现有 BlossomMark 的 translate 布局。
 */
import { LociTokens } from '../../theme/LociTokens'

@ComponentV2
export struct LociBrand {
  @Param markSize: number = 20
  @Param inkColor: string = LociTokens.INK

  @Builder
  private petal(angle: number, x: number, y: number) {
    Ellipse()
      .width(this.markSize * 0.3)
      .height(this.markSize * 0.45)
      .fill(this.inkColor)
      .rotate({ angle: angle })
      .translate({ x: x * this.markSize, y: y * this.markSize })
  }

  build() {
    Row({ space: 8 }) {
      Stack() {
        this.petal(0, 0, -0.25)
        this.petal(72, 0.24, -0.08)
        this.petal(144, 0.15, 0.21)
        this.petal(216, -0.15, 0.21)
        this.petal(288, -0.24, -0.08)
      }
      .width(this.markSize)
      .height(this.markSize)

      Text('loci')
        .fontSize(16)
        .fontWeight(FontWeight.Regular)
        .fontColor(this.inkColor)
        .letterSpacing(-0.6)
    }
    .alignItems(VerticalAlign.Center)
  }
}
