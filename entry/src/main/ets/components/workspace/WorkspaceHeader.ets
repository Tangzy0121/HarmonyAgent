import { LociTokens } from '../../theme/LociTokens'

/** 工作区沉浸页头；只接收展示状态和用户意图，不持有页面业务状态。 */
@ComponentV2
export struct WorkspaceHeader {
  @Param title: string = ''
  @Param bookmarked: boolean = false
  @Event onBack: () => void = (): void => {}
  @Event onOpenChapters: () => void = (): void => {}
  @Event onToggleBookmark: () => void = (): void => {}
  @Event onOpenOverview: () => void = (): void => {}

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column({ space: 2 }) {
        Text('学习书工作区')
          .fontSize(LociTokens.FONT_MICRO)
          .fontColor(LociTokens.INK_MUTED)
        Text(this.title)
          .fontSize(LociTokens.FONT_META)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Center)
      .padding({ left: 72, right: 132 })

      Row() {
        Text('←')
          .fontSize(LociTokens.FONT_SUBTITLE)
          .fontColor(LociTokens.INK)
          .textAlign(TextAlign.Center)
          .width(LociTokens.CONTROL_MIN)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityText('返回学习库')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onBack())
        Blank()

        Column({ space: 4 }) {
          Rect().width(16).height(1.5).fill(LociTokens.INK)
          Rect().width(16).height(1.5).fill(LociTokens.INK)
          Rect().width(16).height(1.5).fill(LociTokens.INK)
        }
        .justifyContent(FlexAlign.Center)
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityText('打开章节目录')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onOpenChapters())

        Stack() {
          Path({ width: 24, height: 24, commands: 'M7 4h10v16l-5-4.2-5 4.2z' })
            .fill(this.bookmarked ? LociTokens.ACTION : Color.Transparent)
            .stroke(LociTokens.ACTION)
            .strokeWidth(1.4)
        }
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityText(this.bookmarked ? '取消收藏当前章节' : '收藏当前章节')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onToggleBookmark())

        Row({ space: 4 }) {
          Circle().width(3).height(3).fill(LociTokens.INK)
          Circle().width(3).height(3).fill(LociTokens.INK)
          Circle().width(3).height(3).fill(LociTokens.INK)
        }
        .justifyContent(FlexAlign.Center)
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityText('更多学习书操作')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onOpenOverview())
      }
      .width('100%')
    }
    .width('100%')
    .height(52)
    .margin({ top: 28 })
  }
}
