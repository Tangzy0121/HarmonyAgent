/**
 * 创建进度指示(来源 / 设置 / 确认)
 * 真源:prototype/src/components/project/CreateProgress.tsx 的 .flow-steps。
 * 已完成步骤为桃色圆点 + 对勾,当前步骤描边提亮,未到步骤弱提示;步骤间细线连接。
 */
import { LociTokens } from '../../theme/LociTokens'

const STEP_LABELS: string[] = ['来源', '设置', '确认']

@ComponentV2
export struct CreateProgress {
  /** 当前步骤,1–3 */
  @Param current: number = 1

  @Builder
  private stepItem(index: number) {
    Column({ space: 10 }) {
      Stack() {
        if (index + 1 < this.current) {
          SymbolGlyph($r('sys.symbol.checkmark'))
            .fontSize(LociTokens.FONT_META)
            .fontColor([LociTokens.ACCENT_INK])
        } else {
          Text(`${index + 1}`)
            .fontSize(LociTokens.FONT_MICRO)
            .fontColor(index + 1 === this.current ? LociTokens.INK : LociTokens.INK_MUTED)
        }
      }
      .width(27)
      .height(27)
      .borderRadius(14)
      .border({
        width: 1,
        color: index + 1 < this.current ? LociTokens.ACCENT :
          index + 1 === this.current ? LociTokens.INK : LociTokens.LINE
      })
      .backgroundColor(index + 1 < this.current ? LociTokens.ACCENT : Color.Transparent)

      Text(STEP_LABELS[index])
        .fontSize(LociTokens.FONT_MICRO)
        .fontWeight(FontWeight.Medium)
        .fontColor(index + 1 === this.current ? LociTokens.INK : LociTokens.INK_MUTED)
    }
    .alignItems(HorizontalAlign.Start)
  }

  build() {
    Row() {
      ForEach(STEP_LABELS, (label: string, index: number) => {
        this.stepItem(index)
        if (index < STEP_LABELS.length - 1) {
          Rect()
            .height(1)
            .layoutWeight(1)
            .fill(LociTokens.LINE)
            .margin({ left: 6, right: 8, top: 13 })
        }
      }, (label: string): string => label)
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
    .accessibilityText(`创建进度,第 ${this.current} 步,共 3 步`)
  }
}
