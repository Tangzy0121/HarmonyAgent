/**
 * 今日页(M1)
 * 真源:prototype/src/pages/TodayPage.tsx + docs/product/03 §3。
 * 结构:页面标题 + 本周日历 → 可选项目通知 → 横向学习目标卡(Swiper,下一张露出)
 * → 卡片分页提示 → 底部动作(开始 / 换一个 / 稍后)→ 日期切换。
 * 纪律:单屏不纵向滚动;卡片色按 tone 固定;触控 ≥44vp;不做大动画。
 * 数据:resources/rawfile/lociFixtures.json 的 recommendations / projects(经 LociAppState)。
 */
import { promptAction } from '@kit.ArkUI'
import { common } from '@kit.AbilityKit'
import { LociTokens } from '../../theme/LociTokens'
import { LociAppState } from '../../models/LociAppState'
import {
  LociProjectNotice,
  LociProjectSummary,
  LociRecommendation,
  RecommendationTone
} from '../../models/LociModels'

const WEEKDAYS: string[] = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const MS_PER_DAY: number = 24 * 60 * 60 * 1000

function dateAtOffset(offset: number): Date {
  const base: Date = new Date()
  base.setHours(12, 0, 0, 0)
  return new Date(base.getTime() + offset * MS_PER_DAY)
}

function toneColor(tone: RecommendationTone): string {
  if (tone === 'mist') {
    return LociTokens.CARD_MIST
  }
  if (tone === 'stone') {
    return LociTokens.CARD_STONE
  }
  return LociTokens.CARD_BLUE
}

interface ActiveNotice {
  project: LociProjectSummary
  notice: LociProjectNotice
}

@ComponentV2
export struct TodayPage {
  @Param appState: LociAppState = new LociAppState()
  @Event onCreate: () => void = (): void => {}
  /** M4:非复习类推荐 / 项目通知动作 → 按项目状态路由(AppRoot.openProject)。 */
  @Event onOpenProject: (project: LociProjectSummary) => void =
    (project: LociProjectSummary): void => {}
  /** M4:kind=review 的推荐 → ReviewPage。 */
  @Event onOpenReview: (project: LociProjectSummary) => void =
    (project: LociProjectSummary): void => {}
  @Local private selectedIndex: number = 0
  @Local private dayOffset: number = 0
  @Local private weekOffset: number = 0
  @Local private calendarOpen: boolean = false
  @Local private deferredIds: string[] = []
  @Local private dismissedNoticeIds: string[] = []
  private swiperController: SwiperController = new SwiperController()

  private visibleRecommendations(): LociRecommendation[] {
    return this.appState.recommendations.filter((item: LociRecommendation): boolean =>
      !this.deferredIds.includes(item.id))
  }

  /** §2.3:一次只突出一个最高优先级通知(danger > warning > info),可关闭。 */
  private activeNotice(): ActiveNotice | null {
    const tones: string[] = ['danger', 'warning', 'info']
    for (const tone of tones) {
      for (const project of this.appState.projects) {
        const notice: LociProjectNotice | undefined = project.notice
        if (notice !== undefined && notice.tone === tone && !this.dismissedNoticeIds.includes(notice.id)) {
          return { project: project, notice: notice }
        }
      }
    }
    return null
  }

  private currentRecommendation(): LociRecommendation | null {
    const list: LociRecommendation[] = this.visibleRecommendations()
    if (list.length === 0) {
      return null
    }
    return list[Math.min(this.selectedIndex, list.length - 1)]
  }

  private selectDay(offset: number): void {
    this.dayOffset = offset
    this.weekOffset = Math.floor(offset / 7)
    this.calendarOpen = false
    this.selectedIndex = 0
    this.swiperController.changeIndex(0, false)
  }

  private moveDay(direction: number): void {
    this.selectDay(this.dayOffset + direction)
  }

  private moveWeek(direction: number): void {
    this.weekOffset += direction
  }

  private swapRecommendation(): void {
    const count: number = this.visibleRecommendations().length
    if (count > 1) {
      this.swiperController.changeIndex((this.selectedIndex + 1) % count, true)
    }
  }

  private deferRecommendation(): void {
    const current: LociRecommendation | null = this.currentRecommendation()
    if (current === null) {
      return
    }
    this.deferredIds = this.deferredIds.concat([current.id])
    this.selectedIndex = Math.min(this.selectedIndex, this.visibleRecommendations().length - 1)
    this.swiperController.changeIndex(Math.max(this.selectedIndex, 0), false)
  }

  /** M4:kind=review → ReviewPage;continue/plan → openProject(active→工作区,plan_ready→方案确认)。 */
  private execute(item: LociRecommendation): void {
    if (item.kind === 'create') {
      this.onCreate()
      return
    }
    const project: LociProjectSummary | undefined = this.appState.projects.find(
      (entry: LociProjectSummary): boolean => entry.id === (item.projectId ?? ''))
    if (project === undefined) {
      promptAction.showToast({ message: '推荐的项目暂不可用', duration: 1800 })
      return
    }
    if (item.kind === 'review') {
      this.onOpenReview(project)
      return
    }
    this.onOpenProject(project)
  }

  private retry(): void {
    const context: common.Context | undefined = this.getUIContext().getHostContext()
    if (context !== undefined) {
      this.appState.load(context as common.UIAbilityContext)
    }
  }

  @Builder
  private calendarIcon() {
    Column({ space: 1 }) {
      Row({ space: 6 }) {
        Rect().width(2).height(4).fill(LociTokens.INK)
        Rect().width(2).height(4).fill(LociTokens.INK)
      }
      Rect()
        .width(18)
        .height(13)
        .radius(2)
        .fill(Color.Transparent)
        .stroke(LociTokens.INK)
        .strokeWidth(1.4)
    }
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  private weekCalendar() {
    Column() {
      Row() {
        Text('‹')
          .fontSize(LociTokens.FONT_TITLE)
          .fontColor(LociTokens.INK)
          .width(44)
          .height(44)
          .textAlign(TextAlign.Center)
          .accessibilityText('上一周')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.moveWeek(-1))
        Text(`${dateAtOffset(this.weekOffset * 7).getMonth() + 1} 月 ${dateAtOffset(this.weekOffset * 7).getDate()} 日起`)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK_SOFT)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('›')
          .fontSize(LociTokens.FONT_TITLE)
          .fontColor(LociTokens.INK)
          .width(44)
          .height(44)
          .textAlign(TextAlign.Center)
          .accessibilityText('下一周')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.moveWeek(1))
      }
      .width('100%')

      Row() {
        ForEach([0, 1, 2, 3, 4, 5, 6], (index: number) => {
          Column({ space: 6 }) {
            Text(WEEKDAYS[dateAtOffset(this.weekOffset * 7 + index).getDay()].slice(1))
              .fontSize(LociTokens.FONT_TINY)
              .fontColor(this.dayOffset === this.weekOffset * 7 + index ?
                LociTokens.SCREEN : LociTokens.INK_MUTED)
            Text(`${dateAtOffset(this.weekOffset * 7 + index).getDate()}`)
              .fontSize(LociTokens.FONT_LABEL)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.dayOffset === this.weekOffset * 7 + index ?
                LociTokens.SCREEN : LociTokens.INK)
          }
          .layoutWeight(1)
          .height(58)
          .justifyContent(FlexAlign.Center)
          .backgroundColor(this.dayOffset === this.weekOffset * 7 + index ?
            LociTokens.INK : Color.Transparent)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.selectDay(this.weekOffset * 7 + index))
        }, (index: number): string => `${index}`)
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_3 })
      .border({ width: { top: 1 }, color: LociTokens.LINE })
    }
    .width('100%')
    .padding(14)
    .margin({ top: LociTokens.SPACE_3 })
    .border({ width: 1, color: LociTokens.LINE_STRONG })
    .backgroundColor(LociTokens.SCREEN)
  }

  @Builder
  private noticeBanner(active: ActiveNotice) {
    Row({ space: LociTokens.SPACE_3 }) {
      Column({ space: 2 }) {
        Text(`${active.project.shortTitle ?? active.project.title} · ${active.notice.title}`)
          .fontSize(LociTokens.FONT_LABEL)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(active.notice.detail)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)

      Text(active.notice.actionLabel)
        .fontSize(LociTokens.FONT_LABEL)
        .fontColor(LociTokens.ACTION)
        .height(LociTokens.CONTROL_MIN)
        .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
        .textAlign(TextAlign.Center)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onOpenProject(active.project))

      Text('×')
        .fontSize(LociTokens.FONT_SUBTITLE)
        .fontColor(LociTokens.INK_MUTED)
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .textAlign(TextAlign.Center)
        .accessibilityText('关闭通知')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => {
          this.dismissedNoticeIds = this.dismissedNoticeIds.concat([active.notice.id])
          // PR-D:服务端通知回写已读(本地 fixture 通知 id 不在服务端,POST 静默失败仅记日志)
          this.appState.dismissNotice(active.notice.id, active.project.id)
        })
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_3 })
    .padding({ top: LociTokens.SPACE_2, bottom: LociTokens.SPACE_2 })
    .border({ width: { top: 1, bottom: 1 }, color: LociTokens.LINE })
  }

  /** M5a:AUTO 探活失败回退 fixture 时的轻量降级提示条(样式对齐 noticeBanner)。 */
  @Builder
  private degradedBanner() {
    Row({ space: LociTokens.SPACE_3 }) {
      Column({ space: 2 }) {
        Text('离线演示数据')
          .fontSize(LociTokens.FONT_LABEL)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
        Text('暂时连不上学习服务,当前展示内置示例;服务恢复后重试即可切换。')
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_3 })
    .padding({ top: LociTokens.SPACE_2, bottom: LociTokens.SPACE_2 })
    .border({ width: { top: 1, bottom: 1 }, color: LociTokens.LINE })
  }

  @Builder
  private recommendationCard(item: LociRecommendation) {
    Column() {
      Row() {
        Text(item.eyebrow)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.ACTION_INK)
        Blank()
        Text(`约 ${item.estimatedMinutes} 分钟`)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.ACTION_INK)
          .opacity(0.68)
      }
      .width('100%')

      Text(item.title)
        .fontSize(LociTokens.FONT_DISPLAY_SMALL)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.ACTION_INK)
        .letterSpacing(-1)
        .lineHeight(40)
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
        .margin({ top: 26 })

      Text(item.reason)
        .fontSize(LociTokens.FONT_META)
        .fontColor(LociTokens.ACTION_INK)
        .opacity(0.72)
        .lineHeight(20)
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })

      Blank()
    }
    .width('100%')
    .height('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(22)
    .backgroundColor(toneColor(item.tone))
    .borderRadius(LociTokens.RADIUS_BLOCK)
  }

  @Builder
  private carousel() {
    Column() {
      if (this.visibleRecommendations().length === 0) {
        Column() {
          Text('今天没有更多学习目标')
            .fontSize(LociTokens.FONT_TITLE)
            .fontWeight(FontWeight.Lighter)
            .fontColor(LociTokens.INK)
          Text('稍后的目标明天会回来,也可以现在新建一个学习项目。')
            .fontSize(LociTokens.FONT_LABEL)
            .fontColor(LociTokens.INK_MUTED)
            .margin({ top: LociTokens.SPACE_3 })
          Button('新建项目')
            .fontSize(LociTokens.FONT_META)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.ACTION_INK)
            .height(LociTokens.CONTROL_MIN)
            .padding({ left: 22, right: 22 })
            .backgroundColor(LociTokens.ACTION)
            .borderRadius(LociTokens.RADIUS_CONTROL)
            .margin({ top: LociTokens.SPACE_5 })
            .onClick((): void => this.onCreate())
        }
        .width('100%')
        .height(310)
        .justifyContent(FlexAlign.Center)
        .border({ width: 1, color: LociTokens.LINE })
        .borderRadius(LociTokens.RADIUS_BLOCK)
      } else {
        Swiper(this.swiperController) {
          ForEach(this.visibleRecommendations(), (item: LociRecommendation) => {
            this.recommendationCard(item)
          }, (item: LociRecommendation): string => item.id)
        }
        .width('100%')
        .height(310)
        .loop(false)
        .indicator(false)
        .itemSpace(LociTokens.SPACE_3)
        .nextMargin(54)
        .onChange((index: number): void => {
          this.selectedIndex = index
        })
      }

      Row() {
        Text('左右滑动切换目标')
          .fontSize(LociTokens.FONT_MICRO)
          .fontColor(LociTokens.INK_MUTED)
        Blank()
        Row({ space: 7 }) {
          ForEach(this.visibleRecommendations(), (item: LociRecommendation, index: number) => {
            Stack() {
              Rect()
                .width(18)
                .height(1)
                .fill(index === this.selectedIndex ? LociTokens.INK : LociTokens.LINE_STRONG)
            }
            .width(18)
            .height(18)
            .accessibilityText(`查看目标 ${index + 1}`)
            .accessibilityRole(AccessibilityRoleType.BUTTON)
            .onClick((): void => {
              this.swiperController.changeIndex(index, true)
            })
          }, (item: LociRecommendation): string => item.id)
        }
      }
      .width('100%')
      .height(42)
      .margin({ top: LociTokens.SPACE_2 })
    }
    .width('100%')
  }

  @Builder
  private bottomActions() {
    Row({ space: LociTokens.SPACE_2 }) {
      Button('开始')
        .fontSize(LociTokens.FONT_META)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.ACTION_INK)
        .height(LociTokens.CONTROL_HEIGHT)
        .padding({ left: 22, right: 22 })
        .backgroundColor(LociTokens.ACTION)
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .onClick((): void => {
          const current: LociRecommendation | null = this.currentRecommendation()
          if (current !== null) {
            // PR-C:服务端来源推荐先回写 completed(本地移除),再按原逻辑跳转
            if (current.kind !== 'create') {
              this.appState.completeRecommendation(current.id)
            }
            this.execute(current)
          }
        })

      Text('换一个')
        .fontSize(LociTokens.FONT_META)
        .fontColor(LociTokens.INK_SOFT)
        .height(LociTokens.CONTROL_MIN)
        .padding({ left: LociTokens.SPACE_4, right: LociTokens.SPACE_4 })
        .textAlign(TextAlign.Center)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => {
          // PR-C:换出的卡回写 dismissed(今日不再出现),再切下一张
          const current: LociRecommendation | null = this.currentRecommendation()
          if (current !== null) {
            this.appState.dismissRecommendation(current.id)
          }
          this.swapRecommendation()
        })

      Text('稍后')
        .fontSize(LociTokens.FONT_META)
        .fontColor(LociTokens.INK_MUTED)
        .height(LociTokens.CONTROL_MIN)
        .padding({ left: LociTokens.SPACE_4, right: LociTokens.SPACE_4 })
        .textAlign(TextAlign.Center)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => {
          // PR-C:服务端来源推荐回写 snoozed(默认 4h 后回来),本地沿用 deferredIds 移除
          const current: LociRecommendation | null = this.currentRecommendation()
          if (current !== null) {
            this.appState.snoozeRecommendation(current.id)
          }
          this.deferRecommendation()
        })
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_2 })
  }

  @Builder
  private datePager() {
    Row() {
      Text('‹')
        .fontSize(LociTokens.FONT_TITLE)
        .fontColor(LociTokens.INK_MUTED)
        .width(44)
        .height(LociTokens.CONTROL_MIN)
        .textAlign(TextAlign.Center)
        .accessibilityText('前一天')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.moveDay(-1))

      Column({ space: 2 }) {
        Text(WEEKDAYS[dateAtOffset(this.dayOffset).getDay()])
          .fontSize(LociTokens.FONT_MICRO)
          .fontColor(LociTokens.INK_MUTED)
        Text(`${dateAtOffset(this.dayOffset).getDate()}`)
          .fontSize(LociTokens.FONT_META)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
      }
      .layoutWeight(1)
      .height(LociTokens.CONTROL_MIN)
      .justifyContent(FlexAlign.Center)
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => {
        this.calendarOpen = true
      })

      Column({ space: 2 }) {
        Text(WEEKDAYS[dateAtOffset(this.dayOffset + 1).getDay()])
          .fontSize(LociTokens.FONT_MICRO)
          .fontColor(LociTokens.INK_MUTED)
        Text(`${dateAtOffset(this.dayOffset + 1).getDate()}`)
          .fontSize(LociTokens.FONT_META)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK_MUTED)
      }
      .layoutWeight(1)
      .height(LociTokens.CONTROL_MIN)
      .justifyContent(FlexAlign.Center)
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => this.moveDay(1))

      Text('›')
        .fontSize(LociTokens.FONT_TITLE)
        .fontColor(LociTokens.INK_MUTED)
        .width(44)
        .height(LociTokens.CONTROL_MIN)
        .textAlign(TextAlign.Center)
        .accessibilityText('后一天')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.moveDay(1))
    }
    .width('100%')
    .height(LociTokens.CONTROL_HEIGHT)
  }

  build() {
    Column() {
      Text(`${dateAtOffset(this.dayOffset).getMonth() + 1} 月 ${dateAtOffset(this.dayOffset).getDate()} 日 · ${WEEKDAYS[dateAtOffset(this.dayOffset).getDay()]}`)
        .fontSize(LociTokens.FONT_LABEL)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK_MUTED)
        .letterSpacing(0.5)
        .width('100%')

      Text('今日学习')
        .fontSize(LociTokens.FONT_DISPLAY)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-2)
        .lineHeight(46)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })

      Row({ space: LociTokens.SPACE_2 }) {
        Text('本周')
          .fontSize(LociTokens.FONT_LABEL)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
          .textAlign(TextAlign.Center)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.selectDay(0))

        Stack() {
          this.calendarIcon()
        }
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityText('打开本周日历')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => {
          this.calendarOpen = !this.calendarOpen
        })
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_3 })

      if (this.calendarOpen) {
        this.weekCalendar()
      }

      if (this.activeNotice() !== null) {
        this.noticeBanner(this.activeNotice() as ActiveNotice)
      }

      if (this.appState.degraded) {
        this.degradedBanner()
      }

      if (this.appState.phase === 'error') {
        Column({ space: LociTokens.SPACE_3 }) {
          Text('学习目标暂时加载失败')
            .fontSize(LociTokens.FONT_BODY)
            .fontColor(LociTokens.INK)
          Text(this.appState.errorMessage)
            .fontSize(LociTokens.FONT_LABEL)
            .fontColor(LociTokens.INK_MUTED)
          Button('重试')
            .fontSize(LociTokens.FONT_META)
            .fontColor(LociTokens.ACTION_INK)
            .height(LociTokens.CONTROL_MIN)
            .backgroundColor(LociTokens.ACTION)
            .borderRadius(LociTokens.RADIUS_CONTROL)
            .onClick((): void => this.retry())
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .margin({ top: LociTokens.SPACE_5 })
      } else if (this.appState.phase === 'loading') {
        Text('正在整理今天的学习目标…')
          .fontSize(LociTokens.FONT_BODY)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
          .margin({ top: LociTokens.SPACE_5 })
      } else {
        Blank()
        this.carousel()
        this.bottomActions()
        this.datePager()
      }
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
