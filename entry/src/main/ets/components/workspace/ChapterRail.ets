/**
 * 章节目录抽屉 ChapterRail(M3)
 * 真源:prototype/src/components/workspace/ChapterRail.tsx;docs/product/03 §7.2(手机端用抽屉)。
 * 左侧滑出层:头部(目录+章节数+关闭)→ 章节列表(序号/标题/时长·来源范围/任务态徽标,
 * 附已读·已验证标记;pending 禁用)→ 底部「项目概览与设置」(M4 ProjectOverviewPage)。
 */
import { LociTokens } from '../../theme/LociTokens'
import { LociChapter, LociProjectSummary, LOCI_EMPTY_PROJECT, chapterTaskStateLabel } from '../../models/LociModels'

function taskStateColor(state: string): string {
  switch (state) {
    case 'ready': return LociTokens.SUCCESS
    case 'running': return LociTokens.ACCENT
    case 'failed': return LociTokens.DANGER
    default: return LociTokens.INK_MUTED
  }
}

@ComponentV2
export struct ChapterRail {
  @Param project: LociProjectSummary = LOCI_EMPTY_PROJECT
  @Param activeChapterId: string = ''
  @Event onSelectChapter: (chapterId: string) => void = (chapterId: string): void => {}
  @Event onClose: () => void = (): void => {}
  /** M4:底部「项目概览与设置」→ ProjectOverviewPage。 */
  @Event onOpenOverview: () => void = (): void => {}

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      // 遮罩:点击关闭,关闭后回到原块与滚动位置(docs/03 §7.2)
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#B3000000')
        .onClick((): void => this.onClose())

      Column() {
        Row() {
          Column({ space: 4 }) {
            Text('学习书目录')
              .fontSize(LociTokens.FONT_CAPTION)
              .fontColor(LociTokens.INK_MUTED)
              .width('100%')
            Text(`${this.project.chapters.length} 个章节`)
              .fontSize(LociTokens.FONT_TITLE)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTokens.INK)
              .width('100%')
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)

          Text('×')
            .fontSize(LociTokens.FONT_SUBSECTION)
            .fontColor(LociTokens.INK)
            .textAlign(TextAlign.Center)
            .width(LociTokens.CONTROL_MIN)
            .height(LociTokens.CONTROL_MIN)
            .accessibilityText('关闭目录')
            .accessibilityRole(AccessibilityRoleType.BUTTON)
            .onClick((): void => this.onClose())
        }
        .width('100%')
        .padding({ left: LociTokens.PAGE_X, right: LociTokens.SPACE_3, top: 56, bottom: LociTokens.SPACE_4 })

        List() {
          ForEach(this.project.chapters, (chapter: LociChapter) => {
            ListItem() {
              this.chapterRow(chapter)
            }
          }, (chapter: LociChapter): string => chapter.id)
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Off)

        Row({ space: 8 }) {
          Row({ space: 3 }) {
            Circle().width(3).height(3).fill(LociTokens.INK_SOFT)
            Circle().width(3).height(3).fill(LociTokens.INK_SOFT)
            Circle().width(3).height(3).fill(LociTokens.INK_SOFT)
          }
          Text('项目概览与设置')
            .fontSize(LociTokens.FONT_META)
            .fontColor(LociTokens.INK_SOFT)
        }
        .width('100%')
        .height(56)
        .padding({ left: LociTokens.PAGE_X })
        .border({ width: { top: 1 }, color: LociTokens.LINE })
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onOpenOverview())
      }
      .width('82%')
      .height('100%')
      .alignItems(HorizontalAlign.Start)
      .backgroundColor(LociTokens.SCREEN)
      .border({ width: { right: 1 }, color: LociTokens.LINE })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private chapterRow(chapter: LociChapter) {
    Row({ space: LociTokens.SPACE_3 }) {
      Text(`${chapter.order + 1}`)
        .fontSize(LociTokens.FONT_LABEL)
        .fontColor(this.activeChapterId === chapter.id ? LociTokens.INK : LociTokens.INK_MUTED)
        .textAlign(TextAlign.Center)
        .width(24)

      Column({ space: 4 }) {
        Text(chapter.title)
          .fontSize(LociTokens.FONT_META)
          .fontWeight(this.activeChapterId === chapter.id ? FontWeight.Medium : FontWeight.Normal)
          .fontColor(this.rowInk(chapter))
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%')
        Text(`${chapter.estimatedMinutes} 分钟 · ${chapter.sourceRange ?? '来源待定'}`)
          .fontSize(LociTokens.FONT_MICRO)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text(`${chapter.read ? '已读' : '未读'} · ${chapter.verified === true ? '已验证' : '未验证'}`)
          .fontSize(LociTokens.FONT_MICRO)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      Row({ space: 5 }) {
        Circle().width(6).height(6).fill(taskStateColor(chapter.taskState))
        Text(chapterTaskStateLabel(chapter.taskState))
          .fontSize(LociTokens.FONT_MICRO)
          .fontColor(taskStateColor(chapter.taskState))
      }
    }
    .width('100%')
    .constraintSize({ minHeight: LociTokens.CONTROL_MIN })
    .padding({ left: LociTokens.PAGE_X, right: LociTokens.SPACE_4, top: 14, bottom: 14 })
    .backgroundColor(this.activeChapterId === chapter.id ? LociTokens.SURFACE : Color.Transparent)
    .opacity(chapter.taskState === 'pending' ? 0.45 : 1)
    .accessibilityRole(AccessibilityRoleType.BUTTON)
    .accessibilityDescription(`第 ${chapter.order + 1} 章 ${chapter.title},${chapterTaskStateLabel(chapter.taskState)}`)
    .onClick((): void => {
      if (chapter.taskState !== 'pending') {
        this.onSelectChapter(chapter.id)
      }
    })
  }

  private rowInk(chapter: LociChapter): string {
    if (chapter.taskState === 'pending') {
      return LociTokens.INK_MUTED
    }
    return this.activeChapterId === chapter.id ? LociTokens.INK : LociTokens.INK_SOFT
  }
}
