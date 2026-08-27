/**
 * 新建项目(M2):三步流的前两步 —— 01 选择来源 / 02 学习设置(03 确认在 PlanPage)。
 * 真源:prototype/src/pages/CreateProjectPage.tsx;docs/product/03 §5.1/§5.2;
 * 视觉基准:HelpCC/harmony-migration/baseline/06-create.png。
 * M5b:「选择文件」接系统 DocumentViewPicker(PDF/MD/DOCX,≤20MB 前置校验);
 * 「使用演示文件」内嵌 Markdown 演示文本;server 模式下「生成方案」走真实上传+提案
 * (POST /api/documents + POST /api/books),FIXTURE 模式保留本地 mock;
 * AUTO 探活失败(degraded)时入口提示需连接服务,不静默走 mock。
 * 契约冲突说明:server 的 goal 是枚举(理解概念/课程学习/考试复习),
 * 故原型的自由文本「学习目标」在此实现为三选一(03 §5.2 允许自由输入,server 暂不支持)。
 * 草稿保存在 CreateFlowViewModel(AppRoot 持有),返回学习库不丢草稿。
 */
import { promptAction } from '@kit.ArkUI'
import { common } from '@kit.AbilityKit'
import { fileIo as fs, picker } from '@kit.CoreFileKit'
import { LociTokens } from '../../theme/LociTokens'
import { LociAppState } from '../../models/LociAppState'
import { LociChapter, LociProjectSummary } from '../../models/LociFixtures'
import { CreateFlowViewModel, MAX_UPLOAD_BYTES } from '../../models/CreateFlowViewModel'
import { DataMode, ServerConfig } from '../../network/ServerConfig'
import { CreateProgress } from './CreateProgress'
import { LociImmersiveHeader } from './LociImmersiveHeader'

interface ChoiceOption {
  id: string
  hint: string
}

/** server LEARNING_GOALS 枚举(server/src/books/bookTypes.ts,只读契约)。 */
const GOAL_OPTIONS: ChoiceOption[] = [
  { id: '理解概念', hint: '弄懂核心概念' },
  { id: '课程学习', hint: '跟着体系学' },
  { id: '考试复习', hint: '冲刺备考' }
]

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
  /** 上传+提案进行中(防重复点击)。 */
  @Local private generating: boolean = false

  /** create_plan 的章节模板:fixture 中 plan_ready 项目(project-hcai)的章节。 */
  private planTemplateChapters(): LociChapter[] {
    const template = this.appState.projects.find((project: LociProjectSummary): boolean =>
      project.status === 'plan_ready' && project.chapters.length > 0)
    return template !== undefined ? template.chapters : []
  }

  /** server 是否可用:FIXTURE 恒否;AUTO 探活失败(degraded)时不可用。 */
  private serverUsable(): boolean {
    if (ServerConfig.DATA_MODE === DataMode.FIXTURE) {
      return false
    }
    return ServerConfig.DATA_MODE === DataMode.SERVER || !this.appState.degraded
  }

  /** 「选择文件」:FIXTURE 走 mock;degraded 提示连接;否则拉起系统文档选择器。 */
  private pickSourceFile(): void {
    if (ServerConfig.DATA_MODE === DataMode.FIXTURE) {
      this.flow.pickMockFile()
      return
    }
    if (!this.serverUsable()) {
      promptAction.showToast({ message: '未连接到学习服务,连接后才能上传文件', duration: 2000 })
      return
    }
    const context: common.Context | undefined = this.getUIContext().getHostContext()
    if (context === undefined) {
      return
    }
    const documentPicker: picker.DocumentViewPicker =
      new picker.DocumentViewPicker(context as common.UIAbilityContext)
    const options: picker.DocumentSelectOptions = new picker.DocumentSelectOptions()
    options.selectMode = picker.DocumentSelectMode.FILE
    options.fileSuffixFilters = ['.pdf', '.md', '.markdown', '.docx']
    documentPicker.select(options)
      .then((uris: Array<string>): void => {
        if (uris.length > 0) {
          this.readPickedFile(uris[0])
        }
      })
      .catch((error: Object): void => {
        console.warn(`[loci] document picker failed: ${JSON.stringify(error)}`)
      })
  }

  /** picker 选回后读字节流:前置校验 >20MB 直接提示不发请求;失败 toast 不崩。 */
  private async readPickedFile(uri: string): Promise<void> {
    let opened: fs.File | null = null
    try {
      const rawName: string = uri.substring(uri.lastIndexOf('/') + 1)
      let name: string = rawName
      try {
        name = decodeURIComponent(rawName)
      } catch (error) {
        // 非法百分号序列保留原值
      }
      opened = fs.openSync(uri, fs.OpenMode.READ_ONLY)
      const stat: fs.Stat = fs.statSync(opened.fd)
      if (stat.size > MAX_UPLOAD_BYTES) {
        promptAction.showToast({ message: '文件超过 20MB 上限,无法上传', duration: 2000 })
        return
      }
      const buffer: ArrayBuffer = new ArrayBuffer(stat.size)
      fs.readSync(opened.fd, buffer, { offset: 0, length: stat.size })
      const message: string = this.flow.setPickedFile(name, new Uint8Array(buffer))
      if (message.length > 0) {
        promptAction.showToast({ message: message, duration: 2000 })
      }
    } catch (error) {
      console.warn(`[loci] read picked file failed: ${JSON.stringify(error)}`)
      promptAction.showToast({ message: '文件读取失败,请重试', duration: 2000 })
    } finally {
      if (opened !== null) {
        fs.closeSync(opened)
      }
    }
  }

  /** 「使用演示文件」:server 可用时内嵌 Markdown 将随生成真实上传;degraded 提示连接。 */
  private pickDemo(): void {
    if (ServerConfig.DATA_MODE !== DataMode.FIXTURE && !this.serverUsable()) {
      promptAction.showToast({ message: '未连接到学习服务,连接后才能上传文件', duration: 2000 })
      return
    }
    this.flow.pickDemoFile()
  }

  /**
   * 生成方案:server 可用 → 上传 + 真实提案(失败 toast,停留在设置页可重试);
   * FIXTURE → 本地克隆模板;degraded → 提示需连接服务。
   */
  private async generatePlan(): Promise<void> {
    if (this.generating || !this.flow.canGeneratePlan()) {
      return
    }
    if (!this.serverUsable()) {
      if (ServerConfig.DATA_MODE === DataMode.FIXTURE) {
        this.flow.createPlan(this.planTemplateChapters())
        this.onShowPlan()
        return
      }
      promptAction.showToast({ message: '未连接到学习服务,连接后才能生成方案', duration: 2000 })
      return
    }
    this.generating = true
    try {
      const project: LociProjectSummary = await this.flow.createPlanFromServer()
      this.appState.upsertProject(project)
      this.appState.registerServerProject(project.id)
      this.onShowPlan()
    } catch (error) {
      promptAction.showToast({
        message: error instanceof Error ? error.message : '方案生成失败,请重试',
        duration: 2500
      })
    } finally {
      this.generating = false
    }
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
      Text('支持 PDF、Markdown、DOCX,单个文件不超过 20MB。')
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
        .onClick((): void => this.pickSourceFile())
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
        Text('使用演示文件')
          .fontSize(11)
          .fontColor(LociTokens.ACCENT)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
          .textAlign(TextAlign.Center)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.pickDemo())
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
      this.choiceRow(GOAL_OPTIONS, this.flow.goal, (id: string): void => {
        this.flow.goal = id
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
          Text(this.generating ? '正在上传并生成方案…' : '生成方案')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.flow.canGeneratePlan() && !this.generating ?
              LociTokens.SCREEN : LociTokens.INK_MUTED)
          if (!this.generating) {
            Text('→')
              .fontSize(13)
              .fontColor(this.flow.canGeneratePlan() ? LociTokens.SCREEN : LociTokens.INK_MUTED)
          }
        }
        .height(LociTokens.CONTROL_HEIGHT)
        .padding({ left: 22, right: 22 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .backgroundColor(this.flow.canGeneratePlan() && !this.generating ?
          LociTokens.INK : LociTokens.SURFACE_RAISED)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .enabled(!this.generating)
        .onClick((): void => {
          this.generatePlan()
        })
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
