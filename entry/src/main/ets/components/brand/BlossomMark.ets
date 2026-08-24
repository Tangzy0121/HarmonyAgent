import { LociTheme } from '../../theme/LociTheme'

@ComponentV2
export struct BlossomMark {
  @Param markSize: number = 24
  @Param petalColor: string = LociTheme.PEACH
  @Param centerColor: string = LociTheme.TEXT_PRIMARY

  build() {
    Stack() {
      Ellipse().width(this.markSize * 0.36).height(this.markSize * 0.48).fill(this.petalColor)
        .translate({ x: 0, y: -this.markSize * 0.25 })
      Ellipse().width(this.markSize * 0.36).height(this.markSize * 0.48).fill(this.petalColor)
        .rotate({ angle: 72 }).translate({ x: this.markSize * 0.24, y: -this.markSize * 0.08 })
      Ellipse().width(this.markSize * 0.36).height(this.markSize * 0.48).fill(this.petalColor)
        .rotate({ angle: 144 }).translate({ x: this.markSize * 0.15, y: this.markSize * 0.21 })
      Ellipse().width(this.markSize * 0.36).height(this.markSize * 0.48).fill(this.petalColor)
        .rotate({ angle: 216 }).translate({ x: -this.markSize * 0.15, y: this.markSize * 0.21 })
      Ellipse().width(this.markSize * 0.36).height(this.markSize * 0.48).fill(this.petalColor)
        .rotate({ angle: 288 }).translate({ x: -this.markSize * 0.24, y: -this.markSize * 0.08 })
      Circle().width(this.markSize * 0.22).height(this.markSize * 0.22).fill(this.centerColor)
    }
    .width(this.markSize)
    .height(this.markSize)
  }
}
