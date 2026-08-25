/**
 * 方案确认(M2,创建流第 3 步)
 * 真源:prototype/src/pages/PlanPage.tsx;docs/product/03 §5.3。
 * 显示目标/水平/深度/总时长 + 章节列表(标题可改、可删章、可上移/下移);
 * 主动作「确认并生成第一章」→ mock 生成进度(约 2.5s)→ toast「生成完成」→ 返回学习库。
 * 确认产物由 flow.buildConfirmedProject() 生成,经 onConfirmed 交给 AppRoot 合并进 LociAppState。
 */
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../../theme/LociTokens'
import { LociProjectSummary } from '../../models/LociFixtures'
import { CreateFlowViewModel, LociPlanChapter } from '../../models/CreateFlowViewModel'
import { CreateProgress } from './CreateProgress'
import { LociImmersiveHeader } from './LociImmersiveHeader'

const GENERATE_TICK_MS: number = 100
const GENERATE_TICK_STEP: number = 4

@ComponentV2
export struct PlanPage {
  @Param flow: CreateFlowViewModel = new CreateFlowViewModel()
  @Event onBack: () => void = (): void => {}
  @Event onConfirmed: (project: LociProjectSummary) => void =
    (project: LociProjectSummary): void => {}
  @Local private generating: boolean = false
  @Local private progress: number = 0
  private generateTimer: number = -1

  aboutToDisappear(): void {
    this.stopTimer()
  }

  private stopTimer(): void {
    if (this.generateTimer >= 0) {
      clearInterval(this.generateTimer)
      this.generateTimer = -1
    }
  }

  private confirmPlan(): void {
    if (this.generating || this.flow.planChapters.length === 0) {
      return
    }
    this.generating = true
    this.progress = 0
    this.generateTimer = setInterval((): void => {
      this.progress = Math.min(100, this.progress + GENERATE_TICK_STEP)
      if (this.progress >= 100) {
        this.stopTimer()
        this.generating = false
        const project: LociProjectSummary = this.flow.buildConfirmedProject()
        promptAction.showToast({ message: '生成完成', duration: 2000 })
        this.onConfirmed(project)
      }
    }, GENERATE_TICK_MS)
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
          .fontColor(index === 0 || this.generating ? LociTokens.INK_MUTED : LociTokens.INK)
          .opacity(index === 0 || this.generating ? 0.4 : 1)
          .width(38)
          .height(LociTokens.CONTROL_MIN)
          .textAlign(TextAlign.Center)
          .accessibilityText('上移')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .enabled(index > 0 && !this.generating)
          .onClick((): void => this.flow.moveChapter(index, -1))
        Text('↓')
          .fontSize(15)
          .fontColor(index === this.flow.planChapters.length - 1 || this.generating ?
            LociTokens.INK_MUTED : LociTokens.INK)
          .opacity(index === this.flow.planChapters.length - 1 || this.generating ? 0.4 : 1)
          .width(38)
          .height(LociTokens.CONTROL_MIN)
          .textAlign(TextAlign.Center)
          .accessibilityText('下移')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .enabled(index < this.flow.planChapters.length - 1 && !this.generating)
          .onClick((): void => this.flow.moveChapter(index, 1))
        Text('×')
          .fontSize(15)
          .fontColor(this.flow.planChapters.length <= 2 || this.generating ?
            LociTokens.INK_MUTED : LociTokens.INK)
          .opacity(this.flow.planChapters.length <= 2 || this.generating ? 0.4 : 1)
          .width(38)
          .height(LociTokens.CONTROL_MIN)
          .textAlign(TextAlign.Center)
          .accessibilityText('删除章节')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .enabled(this.flow.planChapters.length > 2 && !this.generating)
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
        if (this.generating) {
          Stack({ alignContent: Alignment.Start }) {
            Rect().width('100%').height(2).fill(LociTokens.LINE)
            Rect().width(`${this.progress}%`).height(2).fill(LociTokens.ACCENT)
          }
          .width('100%')
          .height(2)
        }
        Button(this.generating ? `正在生成第一章… ${this.progress}%` : '确认并生成第一章')
          .width('100%')
          .height(LociTokens.CONTROL_HEIGHT)
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.generating ? LociTokens.INK_MUTED : LociTokens.ACCENT_INK)
          .backgroundColor(this.generating ? LociTokens.SURFACE_RAISED : LociTokens.ACCENT)
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .enabled(!this.generating)
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
