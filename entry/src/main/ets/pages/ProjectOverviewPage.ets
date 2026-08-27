/**
 * 项目概览 ProjectOverviewPage(M4)
 * 真源:prototype/src/pages/ProjectOverviewPage.tsx;docs/product/03 §6。
 * 定位:管理入口,不是每次阅读前的必经页。包含目标/深度、章节状态、
 * 已读/已验证/待复习、来源资料与依据、方案调整与归档(后两者本期 UI 占位)。
 * 入口:工作区「更多」/ 章节目录抽屉、学习库 blocked/archived/preparing 项目。
 * Mock:blocked 项目「恢复项目 / 重试」把 failed 章改为 running 并写回 appState
 * (真源:PrototypeContext retry_project,通知文案逐字一致);preparing 项目
 * 章节为空时显示「正在整理学习方案」生成中面板。
 * M5d:server 项目 retry 改走 AppRoot.retryServerProject 真实重发(见 AppRoot);
 * preparing/有 running|pending 章时 5s 轮询 ensureProjectDetail,全章终态自动停止,
 * aboutToDisappear 清理定时器;fixture 路径行为不变。
 */
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../theme/LociTokens'
import {
  LociChapter,
  LociProjectNotice,
  LociProjectSummary,
  LociSourceAnchor,
  LOCI_EMPTY_PROJECT,
  chapterTaskStateLabel,
  projectStatusLabel
} from '../models/LociFixtures'
import { LociAppState } from '../models/LociAppState'
import { LociImmersiveHeader } from '../components/create/LociImmersiveHeader'
import { SourceViewer } from '../components/overlays/SourceViewer'

/** 恢复后的项目通知,真源:PrototypeContext retry_project(逐字一致)。 */
const RETRY_NOTICE_TITLE: string = '正在从失败章节继续'
const RETRY_NOTICE_DETAIL: string = '已有章节和学习记录保持不变。完成后会在学习库提示。'
const RETRY_NOTICE_ACTION: string = '阅读已有章节'

function statusColor(status: string): string {
  switch (status) {
    case 'active': return LociTokens.ACCENT
    case 'blocked': return LociTokens.DANGER
    case 'completed': return LociTokens.SUCCESS
    case 'archived': return LociTokens.INK_MUTED
    default: return LociTokens.INK_SOFT
  }
}

function taskStateColor(state: string): string {
  switch (state) {
    case 'ready': return LociTokens.SUCCESS
    case 'running': return LociTokens.ACCENT
    case 'failed': return LociTokens.DANGER
    default: return LociTokens.INK_MUTED
  }
}

function noticeToneColor(tone: string): string {
  switch (tone) {
    case 'danger': return LociTokens.DANGER
    case 'warning': return LociTokens.WARNING
    default: return LociTokens.ACCENT
  }
}

@ComponentV2
export struct ProjectOverviewPage {
  @Param project: LociProjectSummary = LOCI_EMPTY_PROJECT
  /** M5d:server 项目轮询/刷新走 appState;fixture 项目不消费(保持 M4 行为)。 */
  @Param appState: LociAppState = new LociAppState()
  @Event onBack: () => void = (): void => {}
  @Event onOpenWorkspace: (project: LociProjectSummary, chapterId: string) => void =
    (project: LociProjectSummary, chapterId: string): void => {}
  @Event onRetryProject: (project: LociProjectSummary) => void =
    (project: LociProjectSummary): void => {}

  /** Mock:本次会话内已点过恢复/重试(failed→running 已写回 appState,仅 fixture)。 */
  @Local private retried: boolean = false
  @Local private sourceAnchorId: string = ''
  /** M5d server:轮询刷新到的最新投影(@Param 只入不更新,展示统一走 view())。 */
  @Local private live: LociProjectSummary = LOCI_EMPTY_PROJECT
  private pollTimer: number = -1

  /** 展示用项目:server 轮询拉到新投影后覆盖 @Param。 */
  private view(): LociProjectSummary {
    return this.live.id.length > 0 ? this.live : this.project
  }

  private isServer(): boolean {
    return this.appState.isServerProject(this.project.id)
  }

  /** 生成中(preparing)或仍有 running/pending 章时需要轮询;全章终态后停止。 */
  private needsPolling(): boolean {
    const current: LociProjectSummary = this.view()
    return current.status === 'preparing' ||
      current.chapters.some((chapter: LociChapter): boolean =>
        chapter.taskState === 'running' || chapter.taskState === 'pending')
  }

  aboutToAppear(): void {
    if (!this.isServer()) {
      return
    }
    this.refreshFromServer()
    this.startPolling()
  }

  aboutToDisappear(): void {
    this.stopPolling()
  }

  private startPolling(): void {
    if (this.pollTimer >= 0) {
      return
    }
    this.pollTimer = setInterval((): void => this.refreshFromServer(), 5000)
  }

  private stopPolling(): void {
    if (this.pollTimer >= 0) {
      clearInterval(this.pollTimer)
      this.pollTimer = -1
    }
  }

  /** M5d:ensureProjectDetail 刷新并覆盖展示投影;终态后自动停止轮询。 */
  private refreshFromServer(): void {
    this.appState.ensureProjectDetail(this.project.id)
      .then((): void => {
        const latest: LociProjectSummary | undefined = this.appState.projects.find(
          (entry: LociProjectSummary): boolean => entry.id === this.project.id)
        if (latest !== undefined) {
          this.live = latest
        }
        if (!this.needsPolling()) {
          this.stopPolling()
        }
      })
  }

  private chapterState(chapter: LociChapter): string {
    if (this.retried && chapter.taskState === 'failed') {
      return 'running'
    }
    return chapter.taskState
  }

  private effectiveStatus(): string {
    return this.retried && this.view().status === 'blocked' ? 'active' : this.view().status
  }

  private activeNotice(): LociProjectNotice | null {
    if (this.retried) {
      return {
        id: `retry-${this.view().id}`,
        tone: 'info',
        title: RETRY_NOTICE_TITLE,
        detail: RETRY_NOTICE_DETAIL,
        actionLabel: RETRY_NOTICE_ACTION
      } as LociProjectNotice
    }
    return this.view().notice ?? null
  }

  private hasReadable(): boolean {
    return this.view().chapters.some((chapter: LociChapter): boolean =>
      this.chapterState(chapter) === 'ready')
  }

  private readCount(): number {
    return this.view().chapters.filter((chapter: LociChapter): boolean => chapter.read).length
  }

  /**
   * 恢复/重试:fixture 走 M4 Mock 假恢复(retried + AppRoot 写回);
   * server 走 AppRoot.retryServerProject 真实重发,toast 由 AppRoot 呈现,
   * 这里启动轮询跟随章态(error 章重新进入 generating)。
   */
  private retry(): void {
    if (this.isServer()) {
      this.onRetryProject(this.view())
      this.startPolling()
      return
    }
    if (this.retried) {
      return
    }
    this.retried = true
    this.onRetryProject(this.view())
    promptAction.showToast({ message: '已从失败章节继续生成', duration: 1800 })
  }

  private noticeAction(): void {
    const status: string = this.effectiveStatus()
    if (status === 'blocked') {
      this.retry()
    } else if (status === 'preparing') {
      // 准备中:进度已在下方章节区展示,真源为滚动到章节列表,移动端同屏无需动作
    } else {
      this.onOpenWorkspace(this.view(), '')
    }
  }

  private activeAnchor(): LociSourceAnchor | undefined {
    return (this.view().anchors ?? []).find((anchor: LociSourceAnchor): boolean =>
      anchor.id === this.sourceAnchorId)
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() {
        LociImmersiveHeader({
          title: '项目概览',
          meta: this.view().source.name,
          backLabel: '',
          onBack: (): void => this.onBack()
        })

        Scroll() {
          Column() {
            this.hero()
            if (this.activeNotice() !== null) {
              this.noticePanel(this.activeNotice() as LociProjectNotice)
            }
            this.chapterSection()
            this.factSection()
            this.settingsSection()
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        .align(Alignment.Top)
      }
      .width('100%')
      .height('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 28, bottom: LociTokens.SPACE_4 })

      // 证据层:来源查看器(来源资料与依据)
      if (this.sourceAnchorId.length > 0 && this.activeAnchor() !== undefined) {
        SourceViewer({
          sourceName: this.view().source.name,
          anchor: this.activeAnchor() as LociSourceAnchor,
          onClose: (): void => {
            this.sourceAnchorId = ''
          }
        })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(LociTokens.SCREEN)
  }

  /** 头部:状态徽标 + 标题 + 目标 + 级别/深度/章数。 */
  @Builder
  private hero() {
    Column() {
      Text(projectStatusLabel(this.effectiveStatus()))
        .fontSize(10)
        .fontColor(statusColor(this.effectiveStatus()))
        .padding({ left: 10, right: 10, top: 3, bottom: 3 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .border({ width: 1, color: statusColor(this.effectiveStatus()) })
        .margin({ top: LociTokens.SPACE_5 })
      Text(this.view().title)
        .fontSize(LociTokens.FONT_PAGE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-1.5)
        .lineHeight(46)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })
      Text(this.view().goal)
        .fontSize(13)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(21)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })
      Row({ space: LociTokens.SPACE_2 }) {
        Text(this.view().level)
          .fontSize(11)
          .fontColor(LociTokens.INK_SOFT)
          .padding({ left: 12, right: 12, top: 5, bottom: 5 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(LociTokens.SURFACE)
        Text(this.view().depth)
          .fontSize(11)
          .fontColor(LociTokens.INK_SOFT)
          .padding({ left: 12, right: 12, top: 5, bottom: 5 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(LociTokens.SURFACE)
        Text(`${this.view().chapters.length} 章`)
          .fontSize(11)
          .fontColor(LociTokens.INK_SOFT)
          .padding({ left: 12, right: 12, top: 5, bottom: 5 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(LociTokens.SURFACE)
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_4 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ bottom: LociTokens.SPACE_5 })
  }

  /** 项目通知(blocked 恢复 / preparing 进度 / 章节就绪),真源:prototype ProjectNotice。 */
  @Builder
  private noticePanel(notice: LociProjectNotice) {
    Column({ space: 6 }) {
      Text(notice.title)
        .fontSize(14)
        .fontWeight(FontWeight.Medium)
        .fontColor(noticeToneColor(notice.tone))
        .width('100%')
      Text(notice.detail)
        .fontSize(12)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(19)
        .width('100%')
      Text(notice.actionLabel)
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.ACCENT)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.noticeAction())
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(LociTokens.SPACE_4)
    .borderRadius(LociTokens.RADIUS_BLOCK)
    .border({ width: 1, color: noticeToneColor(notice.tone) })
  }

  /** 学习书:章节状态列表;无章节时显示生成中面板(preparing)。 */
  @Builder
  private chapterSection() {
    Column() {
      Row() {
        Column({ space: 6 }) {
          Text('学习书')
            .fontSize(11)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
          Text('章节状态')
            .fontSize(LociTokens.FONT_TITLE)
            .fontWeight(FontWeight.Lighter)
            .fontColor(LociTokens.INK)
            .width('100%')
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)

        if (this.hasReadable()) {
          Row({ space: 5 }) {
            Text('继续学习')
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTokens.ACCENT_INK)
            Text('→')
              .fontSize(12)
              .fontColor(LociTokens.ACCENT_INK)
          }
          .justifyContent(FlexAlign.Center)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: 18, right: 18 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(LociTokens.ACCENT)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onOpenWorkspace(this.view(), ''))
        }
      }
      .width('100%')

      if (this.view().chapters.length === 0) {
        // 生成中面板,真源:prototype generation-state(逐字一致)
        Column({ space: LociTokens.SPACE_3 }) {
          Text('✦')
            .fontSize(20)
            .fontColor(LociTokens.ACCENT)
            .width('100%')
          Text('正在整理学习方案')
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
            .width('100%')
          Text('资料结构、章节边界与来源锚点会依次完成。你可以先离开,进度会保留在学习库。')
            .fontSize(12)
            .fontColor(LociTokens.INK_SOFT)
            .lineHeight(19)
            .width('100%')
          Row({ space: 6 }) {
            Rect().width(24).height(2).fill(LociTokens.ACCENT)
            Rect().width(24).height(2).fill(LociTokens.LINE_STRONG)
            Rect().width(24).height(2).fill(LociTokens.LINE_STRONG)
          }
          .width('100%')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding(LociTokens.SPACE_5)
        .margin({ top: LociTokens.SPACE_4 })
        .borderRadius(LociTokens.RADIUS_BLOCK)
        .backgroundColor(LociTokens.SURFACE)
      } else {
        Column() {
          ForEach(this.view().chapters, (chapter: LociChapter) => {
            Row({ space: LociTokens.SPACE_3 }) {
              Text(`${chapter.order + 1}`)
                .fontSize(12)
                .fontColor(LociTokens.INK_MUTED)
                .textAlign(TextAlign.Center)
                .width(24)
              Column({ space: 4 }) {
                Text(chapter.title)
                  .fontSize(14)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(LociTokens.INK)
                  .width('100%')
                Text(chapter.objective ?? '')
                  .fontSize(11)
                  .fontColor(LociTokens.INK_MUTED)
                  .lineHeight(17)
                  .width('100%')
                  .maxLines(2)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
                Row({ space: LociTokens.SPACE_3 }) {
                  Text(chapterTaskStateLabel(this.chapterState(chapter)))
                    .fontSize(10)
                    .fontColor(taskStateColor(this.chapterState(chapter)))
                    .padding({ left: 10, right: 10, top: 3, bottom: 3 })
                    .borderRadius(LociTokens.RADIUS_CONTROL)
                    .border({ width: 1, color: taskStateColor(this.chapterState(chapter)) })
                  if (this.chapterState(chapter) === 'ready') {
                    Text('打开')
                      .fontSize(12)
                      .fontColor(LociTokens.ACCENT)
                      .height(LociTokens.CONTROL_MIN)
                      .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
                      .accessibilityRole(AccessibilityRoleType.BUTTON)
                      .onClick((): void => this.onOpenWorkspace(this.view(), chapter.id))
                  }
                  if (this.chapterState(chapter) === 'failed') {
                    Text('重试')
                      .fontSize(12)
                      .fontColor(LociTokens.DANGER)
                      .height(LociTokens.CONTROL_MIN)
                      .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
                      .accessibilityRole(AccessibilityRoleType.BUTTON)
                      .onClick((): void => this.retry())
                  }
                }
                .margin({ top: 2 })
              }
              .layoutWeight(1)
              .alignItems(HorizontalAlign.Start)
            }
            .width('100%')
            .padding({ top: LociTokens.SPACE_3, bottom: LociTokens.SPACE_3 })
            .border({ width: { bottom: 1 }, color: LociTokens.LINE })
          }, (chapter: LociChapter): string => chapter.id)
        }
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_5, bottom: LociTokens.SPACE_5 })
    .border({ width: { top: 1 }, color: LociTokens.LINE_STRONG })
  }

  /** 学习状态(已读/已验证/待复习)+ 来源资料与依据。 */
  @Builder
  private factSection() {
    Column() {
      Column() {
        Text('学习状态')
          .fontSize(11)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text('已保存的进展')
          .fontSize(LociTokens.FONT_TITLE)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .width('100%')
          .margin({ top: 6 })
        Row({ space: LociTokens.SPACE_4 }) {
          this.factItem('已读', `${this.readCount()} 章`)
          this.factItem('已验证', `${(this.view().evidence ?? []).length} 条证据`)
          this.factItem('待复习', `${(this.view().reviewConceptIds ?? []).length} 个概念`)
        }
        .width('100%')
        .margin({ top: LociTokens.SPACE_4 })
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)

      Column() {
        Text('来源资料')
          .fontSize(11)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text(this.view().source.name)
          .fontSize(LociTokens.FONT_TITLE)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .width('100%')
          .margin({ top: 6 })
        Text(`${this.view().source.format} · ${this.view().source.size} · ${this.view().source.units ?? ''}`)
          .fontSize(12)
          .fontColor(LociTokens.INK_SOFT)
          .width('100%')
          .margin({ top: LociTokens.SPACE_2 })
        if ((this.view().anchors ?? []).length > 0) {
          Row({ space: 5 }) {
            Text('查看来源与依据')
              .fontSize(13)
              .fontColor(LociTokens.ACCENT)
            Text('→')
              .fontSize(14)
              .fontColor(LociTokens.ACCENT)
          }
          .height(LociTokens.CONTROL_MIN)
          .margin({ top: LociTokens.SPACE_2 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            const first: LociSourceAnchor | undefined = (this.view().anchors ?? [])[0]
            if (first !== undefined) {
              this.sourceAnchorId = first.id
            }
          })
        } else {
          Row({ space: 5 }) {
            Text('◷')
              .fontSize(13)
              .fontColor(LociTokens.INK_MUTED)
            Text('来源定位仍在生成')
              .fontSize(12)
              .fontColor(LociTokens.INK_MUTED)
          }
          .height(LociTokens.CONTROL_MIN)
          .margin({ top: LociTokens.SPACE_2 })
        }
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .margin({ top: LociTokens.SPACE_6 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_5, bottom: LociTokens.SPACE_5 })
    .border({ width: { top: 1 }, color: LociTokens.LINE_STRONG })
  }

  @Builder
  private factItem(label: string, value: string) {
    Column({ space: 4 }) {
      Text(label)
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text(value)
        .fontSize(15)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
        .width('100%')
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
  }

  /** 项目管理:方案调整 / 暂停 / 归档(本期 UI 占位,接 server 时实现)。 */
  @Builder
  private settingsSection() {
    Row() {
      Row({ space: LociTokens.SPACE_3 }) {
        // 归档盒(几何绘制)
        Column({ space: 2 }) {
          Rect().width(14).height(3).radius(1)
            .fill(Color.Transparent).stroke(LociTokens.INK_SOFT).strokeWidth(1.2)
          Rect().width(14).height(10).radius(1)
            .fill(Color.Transparent).stroke(LociTokens.INK_SOFT).strokeWidth(1.2)
        }
        .justifyContent(FlexAlign.Center)
        .width(20)
        .height(20)
        Column({ space: 3 }) {
          Text('项目管理')
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
            .width('100%')
          Text('调整方案、暂停或归档这个项目')
            .fontSize(11)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
        }
        .alignItems(HorizontalAlign.Start)
      }
      .layoutWeight(1)

      Row({ space: 4 }) {
        Text('项目设置')
          .fontSize(12)
          .fontColor(LociTokens.INK_SOFT)
        Text('›')
          .fontSize(15)
          .fontColor(LociTokens.INK_MUTED)
      }
      .height(LociTokens.CONTROL_MIN)
      .padding({ left: LociTokens.SPACE_3, right: LociTokens.SPACE_2 })
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => {
        promptAction.showToast({ message: '方案调整与归档将在接入服务端后提供', duration: 1800 })
      })
    }
    .width('100%')
    .padding({ top: LociTokens.SPACE_4, bottom: LociTokens.SPACE_7 })
    .border({ width: { top: 1 }, color: LociTokens.LINE_STRONG })
  }
}
