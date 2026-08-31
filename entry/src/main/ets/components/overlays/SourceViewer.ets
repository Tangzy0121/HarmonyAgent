/**
 * 来源查看器 SourceViewer(M3,全屏层)
 * 真源:prototype/src/components/overlays/SourceViewer.tsx;docs/product/03 §10。
 * 从 citation 块/概念详情/Chat 引用进入:显示资料名、结构位置、高亮引用片段与前后文;
 * 标注定位精度(无法精确定位的页级引用明确标记);关闭即销毁该层,原页面滚动位置
 * 天然保留(覆盖层不做路由跳转,docs/03 §10「返回后恢复原页面、焦点和滚动位置」)。
 */
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../../theme/LociTokens'
import { LociSourceAnchor, anchorPrecisionLabel } from '../../models/LociModels'

const EMPTY_ANCHOR: LociSourceAnchor = {
  id: '',
  documentId: '',
  location: '',
  excerpt: '',
  precision: 'unavailable'
}

@ComponentV2
export struct SourceViewer {
  @Param sourceName: string = ''
  @Param anchor: LociSourceAnchor = EMPTY_ANCHOR
  @Event onClose: () => void = (): void => {}
  @Local private expanded: boolean = true

  build() {
    Column() {
      // ---- 顶部 ----
      Row() {
        Column({ space: 6 }) {
          Row({ space: 5 }) {
            Stack() {
              Rect().width(11).height(13).radius(1)
                .fill(Color.Transparent).stroke(LociTokens.INK_SOFT).strokeWidth(1.2)
              Line().width(6).height(1).startPoint([0, 0]).endPoint([6, 0])
                .stroke(LociTokens.INK_SOFT).strokeWidth(1).translate({ y: -2 })
              Line().width(6).height(1).startPoint([0, 0]).endPoint([6, 0])
                .stroke(LociTokens.INK_SOFT).strokeWidth(1).translate({ y: 2 })
            }
            .width(11)
            .height(13)
            Text('来源查看器')
              .fontSize(LociTokens.FONT_META)
              .fontColor(LociTokens.INK_SOFT)
          }
          Text(this.sourceName)
            .fontSize(LociTokens.FONT_TITLE)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)

        Text('×')
          .fontSize(LociTokens.FONT_ICON)
          .fontColor(LociTokens.INK)
          .textAlign(TextAlign.Center)
          .width(LociTokens.CONTROL_MIN)
          .height(LociTokens.CONTROL_MIN)
          .border({ width: 1, color: LociTokens.LINE_STRONG })
          .accessibilityText('关闭来源')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onClose())
      }
      .width('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 56, bottom: LociTokens.SPACE_4 })
      .border({ width: { bottom: 1 }, color: LociTokens.LINE })

      // ---- 工具条:搜索 / 缩放占位 / 位置 ----
      Row({ space: LociTokens.SPACE_5 }) {
        Text('搜索')
          .fontSize(LociTokens.FONT_LABEL)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            promptAction.showToast({ message: '来源内搜索将在后续版本提供', duration: 1800 })
          })
        Text('100%')
          .fontSize(LociTokens.FONT_LABEL)
          .fontColor(LociTokens.INK_MUTED)
          .height(LociTokens.CONTROL_MIN)
        Blank()
        Text(this.anchor.location)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
          .textAlign(TextAlign.End)
      }
      .width('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X })
      .border({ width: { bottom: 1 }, color: LociTokens.LINE })

      // ---- 纸面:前后文 + 高亮片段 ----
      Scroll() {
        Column({ space: LociTokens.SPACE_4 }) {
          Text(`${this.sourceName} · ${this.anchor.location}`)
            .fontSize(LociTokens.FONT_CAPTION)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
          if ((this.anchor.contextBefore ?? '').length > 0) {
            Text(this.anchor.contextBefore ?? '')
              .fontSize(LociTokens.FONT_SMALL)
              .fontColor(LociTokens.INK_MUTED)
              .lineHeight(24)
              .width('100%')
          }
          // 高亮引用片段:桃色左边线 + 色块,不用阴影/模糊
          Row() {
            Rect().width(2).height('100%').fill(LociTokens.ACCENT)
            Text(this.anchor.excerpt)
              .fontSize(LociTokens.FONT_BODY)
              .fontColor(LociTokens.INK)
              .lineHeight(26)
              .layoutWeight(1)
              .padding({ left: LociTokens.SPACE_4, top: LociTokens.SPACE_2, bottom: LociTokens.SPACE_2 })
          }
          .width('100%')
          .backgroundColor(LociTokens.SURFACE)
          .borderRadius(2)
          if ((this.anchor.contextAfter ?? '').length > 0) {
            Text(this.anchor.contextAfter ?? '')
              .fontSize(LociTokens.FONT_SMALL)
              .fontColor(LociTokens.INK_MUTED)
              .lineHeight(24)
              .width('100%')
          }
          if (this.expanded) {
            Text('这里保留必要的前后文，帮助核查 Agent 的讲解是否准确表达了资料，而不是只展示一句失去语境的引用。')
              .fontSize(LociTokens.FONT_LABEL)
              .fontColor(LociTokens.INK_MUTED)
              .lineHeight(20)
              .width('100%')
          }
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: LociTokens.SPACE_6, bottom: LociTokens.SPACE_6 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)

      // ---- 底部:定位精度 + 前后文开关 ----
      Row() {
        Text(`定位精度:${anchorPrecisionLabel(this.anchor.precision)}`)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(this.anchor.precision === 'unavailable' ? LociTokens.WARNING : LociTokens.INK_MUTED)
        Blank()
        Text(this.expanded ? '收起前后文' : '查看更多前后文')
          .fontSize(LociTokens.FONT_LABEL)
          .fontColor(LociTokens.ACCENT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            this.expanded = !this.expanded
          })
      }
      .width('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: LociTokens.SPACE_2, bottom: 20 })
      .border({ width: { top: 1 }, color: LociTokens.LINE })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(LociTokens.SCREEN)
  }
}
