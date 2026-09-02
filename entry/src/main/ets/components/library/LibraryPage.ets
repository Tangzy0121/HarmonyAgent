/**
 * 学习库(M2 完整版)
 * 真源:prototype/src/pages/LibraryPage.tsx + ProjectRow.tsx;docs/product/03 §4;
 * 视觉基准:HelpCC/harmony-migration/baseline/03-library.png。
 * 结构:标题+「新建」圆钮(几何居中 +)→ 搜索框(本地过滤)→ 三态筛选(进行中/已完成/已归档)
 * → 按最近学习时间的项目行(状态+最近时间 / 精简标题两行封顶 / 章节进度 / 来源格式 / 一个主动作)。
 * 文案:projectStatusLabel / projectPrimaryAction 与 mockData.ts 逐字一致。
 * 行点击路由由 AppRoot 决定(draft→创建流,plan_ready→方案确认,completed→全书总结,
 * blocked/archived/preparing→项目概览,active→工作区);M4 起行尾「更多」进项目概览。
 */
import { LociTokens } from '../../theme/LociTokens'
import { LociAppState } from '../../models/LociAppState'
import {
  LociChapter,
  LociProjectFilter,
  LociProjectSummary,
  projectPrimaryAction,
  projectStatusLabel
} from '../../models/LociModels'

interface FilterTab {
  id: LociProjectFilter
  label: string
}

const FILTER_TABS: FilterTab[] = [
  { id: 'active', label: '进行中' },
  { id: 'completed', label: '已完成' },
  { id: 'archived', label: '已归档' }
]

function filterCount(projects: LociProjectSummary[], filter: LociProjectFilter): number {
  return projects.filter((project: LociProjectSummary): boolean =>
    filterMatches(project, filter)).length
}

function filterMatches(project: LociProjectSummary, filter: LociProjectFilter): boolean {
  if (filter === 'active') {
    return project.status !== 'completed' && project.status !== 'archived'
  }
  return project.status === filter
}

function queryMatches(project: LociProjectSummary, query: string): boolean {
  if (query.length === 0) {
    return true
  }
  return project.title.includes(query) || (project.shortTitle ?? '').includes(query) ||
    project.goal.includes(query) || project.source.name.includes(query)
}

function readChapterCount(project: LociProjectSummary): number {
  return project.chapters.filter((chapter: LociChapter): boolean => chapter.read).length
}

@ComponentV2
export struct LibraryPage {
  @Param appState: LociAppState = new LociAppState()
  @Event onCreate: () => void = (): void => {}
  @Event onOpenProject: (project: LociProjectSummary) => void =
    (project: LociProjectSummary): void => {}
  /** M4:行尾「更多」→ 项目概览(管理入口,docs/03 §6)。 */
  @Event onOpenOverview: (project: LociProjectSummary) => void =
    (project: LociProjectSummary): void => {}
  @Local private projectFilter: LociProjectFilter = 'active'
  @Local private query: string = ''

  private visibleProjects(): LociProjectSummary[] {
    const keyword: string = this.query.trim()
    return this.appState.projects.filter((project: LociProjectSummary): boolean =>
      filterMatches(project, this.projectFilter) && queryMatches(project, keyword))
  }

  @Builder
  private newProjectButton() {
    Stack() {
      // 几何居中加号(docs/03 §4.2:加号必须在圆形内几何居中)
      Rect().width(14).height(2).fill(LociTokens.SCREEN)
      Rect().width(2).height(14).fill(LociTokens.SCREEN)
    }
    .width(52)
    .height(52)
    .borderRadius(26)
    .backgroundColor(LociTokens.INK)
    .accessibilityText('新建项目')
    .accessibilityRole(AccessibilityRoleType.BUTTON)
    .onClick((): void => this.onCreate())
  }

  @Builder
  private searchField() {
    Row({ space: 9 }) {
      SymbolGlyph($r('sys.symbol.magnifyingglass'))
        .fontSize(LociTokens.FONT_BODY_LARGE)
        .fontColor([LociTokens.INK_SOFT])
      TextInput({ placeholder: '搜索项目或来源', text: this.query })
        .layoutWeight(1)
        .height('100%')
        .padding(0)
        .fontSize(LociTokens.FONT_META)
        .fontColor(LociTokens.INK)
        .placeholderColor(LociTokens.INK_MUTED)
        .placeholderFont({ size: 13 })
        .caretColor(LociTokens.ACTION)
        .backgroundColor(Color.Transparent)
        .showUnderline(false)
        .accessibilityText('搜索学习项目')
        .onChange((value: string): void => {
          this.query = value
        })
    }
    .width('100%')
    .height(50)
    .padding({ left: 17, right: 17 })
    .border({ width: 1, color: LociTokens.LINE_STRONG })
    .borderRadius(LociTokens.RADIUS_CONTROL)
    .margin({ top: LociTokens.SPACE_5 })
  }

  @Builder
  private filterTabs() {
    Row({ space: LociTokens.SPACE_5 }) {
      ForEach(FILTER_TABS, (tab: FilterTab) => {
        Column({ space: 6 }) {
          Row({ space: 5 }) {
            Text(tab.label)
              .fontSize(LociTokens.FONT_META)
              .fontWeight(this.projectFilter === tab.id ? FontWeight.Medium : FontWeight.Normal)
              .fontColor(this.projectFilter === tab.id ? LociTokens.INK : LociTokens.INK_MUTED)
            Text(`${filterCount(this.appState.projects, tab.id)}`)
              .fontSize(LociTokens.FONT_CAPTION)
              .fontColor(this.projectFilter === tab.id ? LociTokens.INK_SOFT : LociTokens.INK_MUTED)
          }
          Rect()
            .width('100%')
            .height(1)
            .fill(this.projectFilter === tab.id ? LociTokens.INK : Color.Transparent)
        }
        .height(LociTokens.CONTROL_MIN)
        // 实机核对发现:子级 Rect 用 100% 宽会把 Column 撑满整行,其余 tab 被挤出屏幕;
        // 固定宽度后三个 tab 各就各位(与工作区 modeTab 同一修法)。
        .width(76)
        .justifyContent(FlexAlign.Center)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .accessibilityDescription(`${tab.label},${filterCount(this.appState.projects, tab.id)} 个项目`)
        .onClick((): void => {
          this.projectFilter = tab.id
        })
      }, (tab: FilterTab): string => tab.id)
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_4 })
  }

  @Builder
  private projectRow(project: LociProjectSummary) {
    Stack({ alignContent: Alignment.TopEnd }) {
      Column() {
        Text(`${projectStatusLabel(project.status)} · ${project.lastStudiedLabel}`)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(project.status === 'active' ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
          .opacity(project.status === 'active' ? 0.62 : 1)
          .width('100%')

        Text(project.shortTitle ?? project.title)
          .fontSize(LociTokens.FONT_SECTION)
          .fontWeight(FontWeight.Lighter)
          .fontColor(project.status === 'active' ? LociTokens.ACCENT_INK : LociTokens.INK)
          .letterSpacing(-1.2)
          .lineHeight(30)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%')
          .margin({ top: 26 })

        Text(`${readChapterCount(project)}/${project.chapters.length} 章 · ${project.source.format}`)
          .fontSize(LociTokens.FONT_MICRO)
          .fontColor(project.status === 'active' ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
          .opacity(project.status === 'active' ? 0.62 : 1)
          .width('100%')
          .margin({ top: 12 })

        Row({ space: 5 }) {
          Text(projectPrimaryAction(project.status))
            .fontSize(LociTokens.FONT_CAPTION)
            .fontWeight(FontWeight.Medium)
            .fontColor(project.status === 'active' ? LociTokens.ACCENT_INK : LociTokens.ACTION)
          Text('→')
            .fontSize(LociTokens.FONT_LABEL)
            .fontColor(project.status === 'active' ? LociTokens.ACCENT_INK : LociTokens.ACTION)
        }
        .width('100%')
        .margin({ top: 16 })
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding({ left: 20, right: 20, top: 18, bottom: 18 })
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => this.onOpenProject(project))

      Row({ space: 4 }) {
        Circle().width(3).height(3).fill(project.status === 'active' ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
        Circle().width(3).height(3).fill(project.status === 'active' ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
        Circle().width(3).height(3).fill(project.status === 'active' ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
      }
      .justifyContent(FlexAlign.Center)
      .width(LociTokens.CONTROL_MIN)
      .height(LociTokens.CONTROL_MIN)
      .margin({ top: 4, right: 4 })
      .accessibilityText(`${project.title}更多操作`)
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => this.onOpenOverview(project))
    }
    .width('100%')
    .border({ width: 1, color: project.status === 'active' ? Color.Transparent : LociTokens.LINE })
    .borderRadius(LociTokens.RADIUS_BLOCK)
    .backgroundColor(project.status === 'active' ? LociTokens.ACCENT : LociTokens.SURFACE)
    .margin({ top: 10 })
  }

  @Builder
  private emptyState() {
    Column() {
      SymbolGlyph($r('sys.symbol.magnifyingglass'))
        .fontSize(LociTokens.FONT_HEADING)
        .fontColor([LociTokens.INK_MUTED])
      Text('没有找到学习项目')
        .fontSize(LociTokens.FONT_SECTION)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .margin({ top: 22 })
      Text('换一个关键词,或者创建一个新的学习项目。')
        .fontSize(LociTokens.FONT_META)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(20)
        .margin({ top: 10 })
      Button('清除搜索')
        .fontSize(LociTokens.FONT_META)
        .fontColor(LociTokens.INK)
        .height(LociTokens.CONTROL_MIN)
        .padding({ left: 22, right: 22 })
        .backgroundColor(Color.Transparent)
        .border({ width: 1, color: LociTokens.LINE_STRONG })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .margin({ top: LociTokens.SPACE_5 })
        .onClick((): void => {
          this.query = ''
        })
    }
    .width('100%')
    .padding({ top: 72, bottom: 72 })
    .border({ width: { top: 1 }, color: LociTokens.LINE })
  }

  build() {
    Column() {
      Text('你的学习项目')
        .fontSize(LociTokens.FONT_LABEL)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')

      Row() {
        Text('学习库')
          .fontSize(LociTokens.FONT_DISPLAY)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .letterSpacing(-2)
          .lineHeight(46)
        Blank()
        this.newProjectButton()
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_3 })

      this.searchField()
      this.filterTabs()

      Row() {
        Text(`${this.visibleProjects().length} 个项目`)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
        Blank()
        Text('按最近学习时间')
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })

      List() {
        ForEach(this.visibleProjects(), (project: LociProjectSummary) => {
          ListItem() {
            this.projectRow(project)
          }
        }, (project: LociProjectSummary): string => project.id)
        if (this.visibleProjects().length === 0) {
          ListItem() {
            this.emptyState()
          }
        }
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .margin({ top: LociTokens.SPACE_2 })
    }
    .width('100%')
    .height('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({
      left: LociTokens.PAGE_X,
      right: LociTokens.PAGE_X,
      top: 100,
      bottom: LociTokens.SPACE_4
    })
    .backgroundColor(LociTokens.SCREEN)
  }
}
