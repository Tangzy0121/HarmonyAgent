/**
 * 新建项目(M2):三步流的前两步 —— 01 选择来源 / 02 学习设置(03 确认在 PlanPage)。
 * 真源:prototype/src/pages/CreateProjectPage.tsx;docs/product/03 §5.1/§5.2;
 * 视觉基准:HelpCC/harmony-migration/baseline/06-create.png。
 * 说明:本期不接系统文件 picker,「选择文件」为 mock 选择,「使用演示资料」填充演示文件;
 * 草稿保存在 CreateFlowViewModel(AppRoot 持有),返回学习库不丢草稿。
 */
import { LociTokens } from '../../theme/LociTokens'
import { LociAppState } from '../../models/LociAppState'
import { LociChapter, LociProjectSummary } from '../../models/LociFixtures'
import { CreateFlowViewModel } from '../../models/CreateFlowViewModel'
import { CreateProgress } from './CreateProgress'
import { LociImmersiveHeader } from './LociImmersiveHeader'

interface ChoiceOption {
  id: string
  hint: string
}

const LEVEL_OPTIONS: ChoiceOption[] = [
  { id: '入门', hint: '首次系统学习' },
  { id: '了解', hint: '知道基本术语' },
  { id: '熟悉', hint: '已有实践经验' }
]

const DEPTH_OPTIONS: ChoiceOption[] = [
  { id: '快速理解', hint: '约 20 分钟' },
  { id: '系统学习', hint: '约 45 分钟' },
  { id: '深入掌握', hint: '约 90 分钟' }
]

@ComponentV2
export struct CreateProjectPage {
  @Param appState: LociAppState = new LociAppState()
  @Param flow: CreateFlowViewModel = new CreateFlowViewModel()
  @Event onBack: () => void = (): void => {}
  @Event onShowPlan: () => void = (): void => {}

  /** create_plan 的章节模板:fixture 中 plan_ready 项目(project-hcai)的章节。 */
  private planTemplateChapters(): LociChapter[] {
    const template = this.appState.projects.find((project: LociProjectSummary): boolean =>
      project.status === 'plan_ready' && project.chapters.length > 0)
    return template !== undefined ? template.chapters : []
  }

  private generatePlan(): void {
    if (!this.flow.canGeneratePlan()) {
      return
    }
    this.flow.createPlan(this.planTemplateChapters())
    this.onShowPlan()
  }

  @Builder
  private choiceRow(options: ChoiceOption[], selected: string, onSelect: (id: string) => void) {
    Row() {
      ForEach(options, (option: ChoiceOption, index: number) => {
        Column({ space: 5 }) {
          Row({ space: 6 }) {
            if (selected === option.id) {
              Circle()
                .width(6)
                .height(6)
                .fill(LociTokens.ACCENT)
            }
            Text(option.id)
              .fontSize(14)
              .fontWeight(FontWeight.Medium)
              .fontColor(selected === option.id ? LociTokens.INK : LociTokens.INK_SOFT)
          }
          Text(option.hint)
            .fontSize(10)
            .fontColor(LociTokens.INK_MUTED)
            .lineHeight(14)
        }
        .layoutWeight(1)
        .height(82)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Start)
        .padding({ left: index === 0 ? 0 : 12 })
        .border({ width: { right: index < options.length - 1 ? 1 : 0 }, color: LociTokens.LINE })
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .accessibilityDescription(selected === option.id ? `${option.id},已选中` : option.id)
        .onClick((): void => onSelect(option.id))
      }, (option: ChoiceOption): string => option.id)
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_4 })
    .border({ width: { top: 1, bottom: 1 }, color: LociTokens.LINE })
  }

  @Builder
  private uploadIcon() {
    // 上传图标(tray + 向上箭头),几何绘制避免依赖系统符号资源
    Stack() {
      Rect().width(20).height(2).fill(LociTokens.INK).translate({ y: 9 })
      Rect().width(2).height(7).fill(LociTokens.INK).translate({ x: -9, y: 5 })
      Rect().width(2).height(7).fill(LociTokens.INK).translate({ x: 9, y: 5 })
      Rect().width(2).height(13).fill(LociTokens.INK).translate({ y: -1 })
      Rect().width(2).height(9).fill(LociTokens.INK).rotate({ angle: -45 }).translate({ x: -2.6, y: -6 })
      Rect().width(2).height(9).fill(LociTokens.INK).rotate({ angle: 45 }).translate({ x: 2.6, y: -6 })
    }
    .width(24)
    .height(24)
  }

  @Builder
  private sourceStage() {
    Column() {
      Text('01 · 来源')
        .fontSize(LociTokens.FONT_LABEL)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text('选择学习资料')
        .fontSize(LociTokens.FONT_PAGE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-1.5)
        .lineHeight(40)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })
      Text('支持 PDF、Markdown、DOCX,仅用于原型展示。')
        .fontSize(13)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(21)
        .width('100%')
        .margin({ top: 18 })

      if (this.flow.file === null) {
        Column({ space: 9 }) {
          this.uploadIcon()
          Text('选择文件')
            .fontSize(LociTokens.FONT_TITLE)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
          Text('PDF · Markdown · DOCX')
            .fontSize(11)
            .fontColor(LociTokens.INK_MUTED)
        }
        .width('100%')
        .height(180)
        .justifyContent(FlexAlign.End)
        .alignItems(HorizontalAlign.Start)
        .padding(22)
        .margin({ top: 38 })
        .border({ width: 1, color: LociTokens.LINE_STRONG })
        .borderRadius(LociTokens.RADIUS_BLOCK)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .accessibilityText('选择文件')
        .onClick((): void => this.flow.pickMockFile())
      } else {
        Row({ space: 14 }) {
          SymbolGlyph($r('sys.symbol.doc'))
            .fontSize(24)
            .fontColor([LociTokens.ACCENT])
          Column({ space: 5 }) {
            Text(this.flow.file.name)
              .fontSize(14)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTokens.INK)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .width('100%')
            Text(`${this.flow.file.format} · ${this.flow.file.size}`)
              .fontSize(10)
              .fontColor(LociTokens.INK_MUTED)
              .width('100%')
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)

          Text('×')
            .fontSize(17)
            .fontColor(LociTokens.INK_MUTED)
            .width(LociTokens.CONTROL_MIN)
            .height(LociTokens.CONTROL_MIN)
            .textAlign(TextAlign.Center)
            .accessibilityText('移除资料')
            .accessibilityRole(AccessibilityRoleType.BUTTON)
            .onClick((): void => this.flow.removeFile())
        }
        .width('100%')
        .height(88)
        .margin({ top: 48 })
        .padding({ top: 14, bottom: 14 })
        .border({ width: { top: 1, bottom: 1 }, color: LociTokens.LINE })
      }

      Row() {
        Blank()
        Text('使用演示资料')
          .fontSize(11)
          .fontColor(LociTokens.ACCENT)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
          .textAlign(TextAlign.Center)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.flow.pickDemoFile())
      }
      .width('100%')

      Row() {
        Blank()
        // 内联主按钮(不用 @Builder:V2 传参响应式在实机上不可靠,实机核对踩坑)
        Row({ space: 6 }) {
          Text('下一步')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.flow.canProceedSource() ? LociTokens.SCREEN : LociTokens.INK_MUTED)
          Text('→')
            .fontSize(13)
            .fontColor(this.flow.canProceedSource() ? LociTokens.SCREEN : LociTokens.INK_MUTED)
        }
        .height(LociTokens.CONTROL_HEIGHT)
        .padding({ left: 22, right: 22 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .backgroundColor(this.flow.canProceedSource() ? LociTokens.INK : LociTokens.SURFACE_RAISED)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.flow.goToSettings())
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  private settingsStage() {
    Column() {
      Text('02 · 设置')
        .fontSize(LociTokens.FONT_LABEL)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text('设置学习方式')
        .fontSize(LociTokens.FONT_PAGE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-1.5)
        .lineHeight(40)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })
      Text('用于调整讲解与练习深度。')
        .fontSize(13)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(21)
        .width('100%')
        .margin({ top: 18 })

      Text('学习目标')
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
        .width('100%')
        .margin({ top: 38 })
      TextArea({ placeholder: '例如:能评审一个 AI 产品方案。', text: this.flow.goal })
        .width('100%')
        .height(64)
        .fontSize(15)
        .fontColor(LociTokens.INK)
        .placeholderColor(LociTokens.INK_MUTED)
        .caretColor(LociTokens.ACCENT)
        .backgroundColor(Color.Transparent)
        .padding({ left: 0, right: 0, top: 12, bottom: 12 })
        .margin({ top: 6 })
        .border({ width: { bottom: 1 }, color: LociTokens.LINE_STRONG })
        .borderRadius(0)
        .onChange((value: string): void => {
          this.flow.goal = value
        })

      Text('当前水平')
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
        .width('100%')
        .margin({ top: 30 })
      this.choiceRow(LEVEL_OPTIONS, this.flow.level, (id: string): void => {
        this.flow.level = id
      })

      Text('学习深度')
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
        .width('100%')
        .margin({ top: 30 })
      this.choiceRow(DEPTH_OPTIONS, this.flow.depth, (id: string): void => {
        this.flow.depth = id
      })

      Row({ space: 6 }) {
        Row({ space: 4 }) {
          Text('←')
            .fontSize(13)
            .fontColor(LociTokens.INK_SOFT)
          Text('上一步')
            .fontSize(13)
            .fontColor(LociTokens.INK_SOFT)
        }
        .height(LociTokens.CONTROL_HEIGHT)
        .padding({ left: 18, right: 18 })
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.flow.backToSource())

        Blank()

        // 内联主按钮(不用 @Builder,同「下一步」的 V2 响应式坑)
        Row({ space: 6 }) {
          Text('生成方案')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.flow.canGeneratePlan() ? LociTokens.SCREEN : LociTokens.INK_MUTED)
          Text('→')
            .fontSize(13)
            .fontColor(this.flow.canGeneratePlan() ? LociTokens.SCREEN : LociTokens.INK_MUTED)
        }
        .height(LociTokens.CONTROL_HEIGHT)
        .padding({ left: 22, right: 22 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .backgroundColor(this.flow.canGeneratePlan() ? LociTokens.INK : LociTokens.SURFACE_RAISED)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.generatePlan())
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  build() {
    Column() {
      LociImmersiveHeader({
        title: '新建项目',
        meta: `${this.flow.step} / 3`,
        backLabel: '学习库',
        onBack: (): void => this.onBack()
      })

      Scroll() {
        Column() {
          CreateProgress({ current: this.flow.step })
          if (this.flow.step === 1) {
            this.sourceStage()
          } else {
            this.settingsStage()
          }
        }
        .width('100%')
        .padding({ bottom: 40 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .margin({ top: 30 })
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
