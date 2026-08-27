/**
 * 方案确认(M2,创建流第 3 步;M5b 接真实 server)
 * 真源:prototype/src/pages/PlanPage.tsx;docs/product/03 §5.3。
 * 显示目标/水平/深度/总时长 + 章节列表(标题可改、可删章、可上移/下移,均为本地 draft)。
 * 主动作「确认并生成第一章」:
 * - server 提案(flow.createdBookId 非空)→ PUT /api/books/:id/proposal + POST /:id/confirm,
 *   成功后经 onConfirmed 交 AppRoot upsert 并直接进项目(生成进度由 M5c SSE 接管,
 *   本切片 confirm 后章节生成状态靠概览/工作区现有呈现);
 * - FIXTURE 本地方案 → buildConfirmedProject 合成,回学习库(原 M2 行为,假进度已删)。
 */
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../../theme/LociTokens'
import { LociProjectSummary } from '../../models/LociFixtures'
import { CreateFlowViewModel, LociPlanChapter } from '../../models/CreateFlowViewModel'
import { CreateProgress } from './CreateProgress'
import { LociImmersiveHeader } from './LociImmersiveHeader'

@ComponentV2
export struct PlanPage {
  @Param flow: CreateFlowViewModel = new CreateFlowViewModel()
  @Event onBack: () => void = (): void => {}
  /** enterProject=true(server 确认成功)时 AppRoot 直接进项目;false(FIXTURE)回学习库。 */
  @Event onConfirmed: (project: LociProjectSummary, enterProject: boolean) => void =
    (project: LociProjectSummary, enterProject: boolean): void => {}
  /** 提交中(PUT proposal + POST confirm),防重复点击并禁用章节编辑。 */
  @Local private submitting: boolean = false

  private confirmPlan(): void {
    if (this.submitting || this.flow.planChapters.length === 0) {
      return
    }
    if (this.flow.createdBookId.length === 0) {
      // FIXTURE 本地路径:无 server 可确认,直接合成项目
      const project: LociProjectSummary = this.flow.buildConfirmedProject()
      promptAction.showToast({ message: '生成完成', duration: 2000 })
      this.onConfirmed(project, false)
      return
    }
    this.submitting = true
    this.flow.confirmPlanOnServer()
      .then((project: LociProjectSummary): void => {
        promptAction.showToast({ message: '方案已确认,开始生成', duration: 2000 })
        this.onConfirmed(project, true)
      })
      .catch((error: Object): void => {
        promptAction.showToast({
          message: error instanceof Error ? error.message : '确认失败,请重试',
          duration: 2500
        })
      })
      .finally((): void => {
        this.submitting = false
      })
  }

  @Builder
  private chapterRow(chapter: LociPlanChapter, index: number) {
    Row({ space: 10 }) {
      Text(`0${index + 1}`.slice(-2))
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width(30)

      Column({ space: 5 }) {
        TextInput({ text: chapter.title })
          .width('100%')
          .padding(0)
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
          .caretColor(LociTokens.ACCENT)
          .backgroundColor(Color.Transparent)
          .showUnderline(false)
          .accessibilityText(`第 ${index + 1} 章标题`)
          .onChange((value: string): void => {
            chapter.title = value
          })
        Text(`${chapter.estimatedMinutes} 分钟`)
          .fontSize(10)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      Row() {
        Text('↑')
          .fontSize(15)
          .fontColor(index === 0 || this.submitting ? LociTokens.INK_MUTED : LociTokens.INK)
          .opacity(index === 0 || this.submitting ? 0.4 : 1)
          .width(38)
          .height(LociTokens.CONTROL_MIN)
          .textAlign(TextAlign.Center)
          .accessibilityText('上移')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .enabled(index > 0 && !this.submitting)
          .onClick((): void => this.flow.moveChapter(index, -1))
        Text('↓')
          .fontSize(15)
          .fontColor(index === this.flow.planChapters.length - 1 || this.submitting ?
            LociTokens.INK_MUTED : LociTokens.INK)
          .opacity(index === this.flow.planChapters.length - 1 || this.submitting ? 0.4 : 1)
          .width(38)
          .height(LociTokens.CONTROL_MIN)
          .textAlign(TextAlign.Center)
          .accessibilityText('下移')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .enabled(index < this.flow.planChapters.length - 1 && !this.submitting)
          .onClick((): void => this.flow.moveChapter(index, 1))
        Text('×')
          .fontSize(15)
          .fontColor(this.flow.planChapters.length <= this.flow.minChapters() || this.submitting ?
            LociTokens.INK_MUTED : LociTokens.INK)
          .opacity(this.flow.planChapters.length <= this.flow.minChapters() || this.submitting ? 0.4 : 1)
          .width(38)
          .height(LociTokens.CONTROL_MIN)
          .textAlign(TextAlign.Center)
          .accessibilityText('删除章节')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .enabled(this.flow.planChapters.length > this.flow.minChapters() && !this.submitting)
          .onClick((): void => this.flow.removeChapter(chapter.id))
      }
    }
    .width('100%')
    .padding({ top: 14, bottom: 14 })
    .border({ width: { bottom: 1 }, color: LociTokens.LINE })
  }

  @Builder
  private metaItem(label: string, value: string) {
    Column({ space: 6 }) {
      Text(label)
        .fontSize(10)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text(value)
        .fontSize(12)
        .fontColor(LociTokens.INK)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
    .padding({ top: 16, bottom: 16 })
  }

  build() {
    Column() {
      LociImmersiveHeader({
        title: '确认方案',
        meta: '3 / 3',
        backLabel: '学习库',
        onBack: (): void => this.onBack()
      })

      Scroll() {
        Column() {
          CreateProgress({ current: 3 })

          Text('03 · 确认')
            .fontSize(LociTokens.FONT_LABEL)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
            .margin({ top: 40 })
          Text(this.flow.planTitle || '新的学习项目')
            .fontSize(LociTokens.FONT_PAGE)
            .fontWeight(FontWeight.Lighter)
            .fontColor(LociTokens.INK)
            .letterSpacing(-1.5)
            .lineHeight(40)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .width('100%')
            .margin({ top: LociTokens.SPACE_3 })
          if (this.flow.goal.trim().length > 0) {
            Text(this.flow.goal.trim())
              .fontSize(13)
              .fontColor(LociTokens.INK_SOFT)
              .lineHeight(21)
              .width('100%')
              .margin({ top: LociTokens.SPACE_3 })
          }

          Row() {
            this.metaItem('水平', this.flow.level)
            this.metaItem('深度', this.flow.depth)
            this.metaItem('时间', `${this.flow.totalMinutes()} 分钟`)
          }
          .width('100%')
          .margin({ top: 38 })
          .border({ width: { top: 1, bottom: 1 }, color: LociTokens.LINE })

          Row({ space: LociTokens.SPACE_3 }) {
            Text('✦')
              .fontSize(16)
              .fontColor(LociTokens.ACCENT)
              .width(20)
              .textAlign(TextAlign.Center)
            Column({ space: 4 }) {
              Text('方案依据')
                .fontSize(12)
                .fontWeight(FontWeight.Medium)
                .fontColor(LociTokens.INK)
                .width('100%')
              Text('先建立框架,再用例子验证。确认后优先生成第一章。')
                .fontSize(11)
                .fontColor(LociTokens.INK_MUTED)
                .lineHeight(17)
                .width('100%')
            }
            .layoutWeight(1)
            .alignItems(HorizontalAlign.Start)
          }
          .width('100%')
          .margin({ top: LociTokens.SPACE_5 })

          Row() {
            Column({ space: 7 }) {
              Text('学习路径')
                .fontSize(LociTokens.FONT_LABEL)
                .fontWeight(FontWeight.Medium)
                .fontColor(LociTokens.INK_MUTED)
                .width('100%')
              Text(`${this.flow.planChapters.length} 章`)
                .fontSize(LociTokens.FONT_SECTION)
                .fontWeight(FontWeight.Lighter)
                .fontColor(LociTokens.INK)
                .letterSpacing(-1)
                .width('100%')
            }
            .alignItems(HorizontalAlign.Start)
            Blank()
            Text('可编辑')
              .fontSize(10)
              .fontColor(LociTokens.INK_MUTED)
          }
          .width('100%')
          .margin({ top: 56, bottom: 20 })

          Column() {
            ForEach(this.flow.planChapters, (chapter: LociPlanChapter, index: number) => {
              this.chapterRow(chapter, index)
            }, (chapter: LociPlanChapter): string => chapter.id)
          }
          .width('100%')
          .border({ width: { top: 1 }, color: LociTokens.LINE })
        }
        .width('100%')
        .padding({ bottom: 24 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .margin({ top: 30 })

      Column({ space: LociTokens.SPACE_3 }) {
        Button(this.submitting ? '正在确认方案…' : '确认并生成第一章')
          .width('100%')
          .height(LociTokens.CONTROL_HEIGHT)
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.submitting ? LociTokens.INK_MUTED : LociTokens.ACCENT_INK)
          .backgroundColor(this.submitting ? LociTokens.SURFACE_RAISED : LociTokens.ACCENT)
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .enabled(!this.submitting)
          .onClick((): void => this.confirmPlan())
      }
      .width('100%')
      .padding({ top: LociTokens.SPACE_3 })
      .border({ width: { top: 1 }, color: LociTokens.LINE })
    }
    .width('100%')
    .height('100%')
    .padding({
      left: LociTokens.PAGE_X,
      right: LociTokens.PAGE_X,
      top: 22,
      bottom: LociTokens.SPACE_4
    })
    .backgroundColor(LociTokens.SCREEN)
  }
}
