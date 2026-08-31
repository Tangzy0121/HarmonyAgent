/**
 * App 壳(M1 + M2 + M3 + M4):NavPathStack + 一级页面(今日/学习库)+ 全屏文字导航
 * + 沉浸页(新建项目 create / 方案确认 plan / M3 学习书工作区 workspace
 * / M4 短复习 review / 全书总结 summary / 项目概览 overview)。
 * 真源:prototype/src/components/shell/AppShell.tsx、MobileIdentity.tsx;docs/product/03 §2/§5。
 * 纪律:屏内纯黑画布;一级内容只有今日/学习库;无底部导航、无悬浮 Agent 入口
 * 不设置底部导航、悬浮 Agent 入口或独立 Profile 入口。
 * 沉浸页(create/plan/workspace/review/summary/overview)隐藏全局身份条;
 * createFlow 由壳持有,返回不丢草稿。
 * M4 open_project 路由:draft→创建流,plan_ready→方案确认,active→工作区,
 * completed→全书总结,preparing/blocked/archived→项目概览。
 */
import { common } from '@kit.AbilityKit'
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../theme/LociTokens'
import { LociAppState } from '../models/LociAppState'
import { LociChapter, LociProjectNotice, LociProjectSummary } from '../models/LociModels'
import { CreateFlowViewModel } from '../models/CreateFlowViewModel'
import {
  LociChapterGenerationCallbacks,
  LociChapterGenerationSession
} from '../models/LociServiceModels'
import { LociIdentityBar } from '../components/shell/LociIdentityBar'
import { LociMenuOverlay } from '../components/shell/LociMenuOverlay'
import { TodayPage } from '../components/today/TodayPage'
import { LibraryPage } from '../components/library/LibraryPage'
import { CreateProjectPage } from '../components/create/CreateProjectPage'
import { PlanPage } from '../components/create/PlanPage'
import { WorkspacePage, LociWorkspaceNav } from './WorkspacePage'
import { ReviewPage, LociReviewNav } from './ReviewPage'
import { SummaryPage } from './SummaryPage'
import { ProjectOverviewPage } from './ProjectOverviewPage'

@ComponentV2
export struct AppRoot {
  private pathStack: NavPathStack = new NavPathStack()
  private appState: LociAppState = new LociAppState()
  private createFlow: CreateFlowViewModel = new CreateFlowViewModel()
  @Local private menuOpen: boolean = false
  @Local private currentPage: string = 'today'

  aboutToAppear(): void {
    const context: common.Context | undefined = this.getUIContext().getHostContext()
    if (context !== undefined) {
      this.appState.load(context as common.UIAbilityContext)
    }
    this.pathStack.replacePath({ name: 'today' })
  }

  private navigatePrimary(name: string): void {
    this.menuOpen = false
    this.currentPage = name
    this.pathStack.replacePath({ name: name })
  }

  private openCreate(): void {
    this.currentPage = 'create'
    this.pathStack.pushPath({ name: 'create' })
  }

  /**
   * open_project 路由(M4):draft→创建流,plan_ready→方案确认,
   * active→学习书工作区,completed→全书总结,
   * preparing/blocked/archived→项目概览(管理入口,docs/03 §6)。
   */
  private openProject(project: LociProjectSummary): void {
    if (project.status === 'draft') {
      this.createFlow.loadDraftFromProject(project)
      this.openCreate()
      return
    }
    if (project.status === 'plan_ready') {
      this.createFlow.loadPlanFromProject(project)
      this.currentPage = 'plan'
      this.pathStack.pushPath({ name: 'plan' })
      return
    }
    if (project.status === 'completed') {
      this.currentPage = 'summary'
      this.pathStack.pushPath({ name: 'summary', param: project })
      return
    }
    if (project.status === 'preparing' || project.status === 'blocked' ||
      project.status === 'archived') {
      this.openOverview(project)
      return
    }
    // active → 工作区;server 项目先拉/刷新详情再进(M5a 详情;M5c 断线恢复:拿到最新章态与已落盘块)
    if (this.appState.isServerProject(project.id)) {
      this.appState.ensureProjectDetail(project.id)
        .then((): void => {
          const latest: LociProjectSummary = this.appState.projects.find(
            (entry: LociProjectSummary): boolean => entry.id === project.id) ?? project
          this.openWorkspace(latest, '')
        })
      return
    }
    this.openWorkspace(project, '')
  }

  /** 进工作区;chapterId 非空时定位到指定章(概览「打开」直达)。 */
  private openWorkspace(project: LociProjectSummary, chapterId: string): void {
    this.currentPage = 'workspace'
    const nav: LociWorkspaceNav = { project: project, chapterId: chapterId }
    this.pathStack.pushPath({ name: 'workspace', param: nav })
  }

  /** 进项目概览;优先取 appState 中的最新副本(retry mock 会写回)。 */
  private openOverview(project: LociProjectSummary): void {
    const latest: LociProjectSummary = this.appState.projects.find(
      (entry: LociProjectSummary): boolean => entry.id === project.id) ?? project
    this.currentPage = 'overview'
    this.pathStack.pushPath({ name: 'overview', param: latest })
  }

  /** 进短复习;returnLabel 由入口决定(学习书/今日/全书总结)。 */
  private openReview(project: LociProjectSummary, returnLabel: string): void {
    this.currentPage = 'review'
    const nav: LociReviewNav = { project: project, returnLabel: returnLabel }
    this.pathStack.pushPath({ name: 'review', param: nav })
  }

  /**
   * M4 Mock 恢复:真源 PrototypeContext retry_project——
   * blocked→active、failed 章→running、替换为「正在从失败章节继续」通知,
   * 写回 appState,之后从概览「继续学习」进工作区可见 running 章。
   * M5d:server 项目改走真实重发——error/failed 与 pending 章逐章 startChapterGeneration
   * (复用 M5c SSE 会话,无 LLM key 时 503 chapter_not_configured 经 toast 呈现),
   * 结束后 ensureProjectDetail 刷新;fixture 项目保持本地假恢复。
   */
  private retryProject(project: LociProjectSummary): void {
    if (this.appState.isServerProject(project.id)) {
      this.retryServerProject(project)
      return
    }
    const chapters: LociChapter[] = project.chapters.map((chapter: LociChapter): LociChapter => {
      if (chapter.taskState !== 'failed') {
        return chapter
      }
      return {
        id: chapter.id,
        order: chapter.order,
        title: chapter.title,
        estimatedMinutes: chapter.estimatedMinutes,
        taskState: 'running',
        read: chapter.read,
        objective: chapter.objective,
        sourceRange: chapter.sourceRange,
        verified: chapter.verified,
        blocks: chapter.blocks
      } as LociChapter
    })
    const notice: LociProjectNotice = {
      id: `retry-${project.id}`,
      tone: 'info',
      title: '正在从失败章节继续',
      detail: '已有章节和学习记录保持不变。完成后会在学习库提示。',
      actionLabel: '阅读已有章节'
    }
    const next: LociProjectSummary = {
      id: project.id,
      title: project.title,
      shortTitle: project.shortTitle,
      goal: project.goal,
      level: project.level,
      depth: project.depth,
      source: project.source,
      status: 'active',
      lastStudiedLabel: project.lastStudiedLabel,
      chapters: chapters,
      notice: notice,
      lastChapterId: project.lastChapterId,
      concepts: project.concepts,
      relations: project.relations,
      anchors: project.anchors,
      evidence: project.evidence,
      reviewConceptIds: project.reviewConceptIds
    }
    this.appState.upsertProject(next)
  }

  /**
   * M5d:server 项目真实重发——逐章 startChapterGeneration(串行,首章失败即停),
   * 生成结束后 ensureProjectDetail 刷新;结果经 toast 呈现,概览页轮询跟随章态。
   */
  private retryServerProject(project: LociProjectSummary): void {
    const targets: LociChapter[] = project.chapters.filter((chapter: LociChapter): boolean =>
      chapter.taskState === 'failed' || chapter.taskState === 'pending')
    if (targets.length === 0) {
      promptAction.showToast({ message: '没有待重新生成的章节', duration: 1800 })
      return
    }
    promptAction.showToast({ message: `已发起 ${targets.length} 个章节的重新生成`, duration: 1800 })
    let frameError: string = ''
    const callbacks: LociChapterGenerationCallbacks = {
      onChapterStart: (): void => {},
      onBlock: (): void => {},
      onChapterDone: (): void => {},
      onError: (code: string, message: string): void => {
        frameError = message.length > 0 ? message : '章节生成失败,请重试'
      }
    }
    const run = async (): Promise<void> => {
      for (const chapter of targets) {
        if (frameError.length > 0) {
          break
        }
        const session: LociChapterGenerationSession =
          this.appState.startChapterGeneration(project.id, chapter.id, callbacks)
        await session.done
      }
    }
    run()
      .then((): void => {
        this.appState.ensureProjectDetail(project.id)
        promptAction.showToast({
          message: frameError.length > 0 ? frameError : '章节生成完成', duration: 2400
        })
      })
      .catch((error: Object): void => {
        this.appState.ensureProjectDetail(project.id)
        promptAction.showToast({
          message: error instanceof Error ? error.message : '章节生成失败,请重试', duration: 2400
        })
      })
  }

  /**
   * confirm_plan 落地:合并项目 → 重置草稿 → 回学习库。
   * M5b:enterProject=true(server 确认成功)时回学习库后直接进项目——
   * status=generating 经映射为 preparing/active,走现有 open_project 路由(概览/工作区)。
   */
  private onPlanConfirmed(project: LociProjectSummary, enterProject: boolean): void {
    this.appState.upsertProject(project)
    if (enterProject) {
      this.appState.registerServerProject(project.id)
    }
    this.createFlow.reset()
    this.currentPage = 'library'
    this.pathStack.popToIndex(0)
    this.pathStack.replacePath({ name: 'library' })
    if (enterProject) {
      this.openProject(project)
    }
  }

  private popImmersive(): void {
    this.pathStack.pop()
  }

  private syncCurrentPage(name: string): void {
    this.currentPage = name
  }

  @Builder
  private pageMap(name: string, param: Object) {
    if (name === 'library') {
      NavDestination() {
        LibraryPage({
          appState: this.appState,
          onCreate: (): void => this.openCreate(),
          onOpenProject: (project: LociProjectSummary): void => this.openProject(project),
          onOpenOverview: (project: LociProjectSummary): void => this.openOverview(project)
        })
      }
      .hideTitleBar(true)
      .backgroundColor(LociTokens.SCREEN)
      .onShown((): void => this.syncCurrentPage('library'))
    } else if (name === 'create') {
      NavDestination() {
        CreateProjectPage({
          appState: this.appState,
          flow: this.createFlow,
          onBack: (): void => this.popImmersive(),
          onShowPlan: (): void => {
            this.currentPage = 'plan'
            this.pathStack.pushPath({ name: 'plan' })
          }
        })
      }
      .hideTitleBar(true)
      .backgroundColor(LociTokens.SCREEN)
      .onShown((): void => this.syncCurrentPage('create'))
    } else if (name === 'plan') {
      NavDestination() {
        PlanPage({
          flow: this.createFlow,
          onBack: (): void => this.popImmersive(),
          onConfirmed: (project: LociProjectSummary, enterProject: boolean): void =>
            this.onPlanConfirmed(project, enterProject)
        })
      }
      .hideTitleBar(true)
      .backgroundColor(LociTokens.SCREEN)
      .onShown((): void => this.syncCurrentPage('plan'))
    } else if (name === 'workspace') {
      NavDestination() {
        WorkspacePage({
          project: (param as LociWorkspaceNav).project,
          initialChapterId: (param as LociWorkspaceNav).chapterId,
          appState: this.appState,
          onBack: (): void => this.popImmersive(),
          onOpenOverview: (): void => {
            this.openOverview((param as LociWorkspaceNav).project)
          },
          onOpenReview: (): void => {
            this.openReview((param as LociWorkspaceNav).project, '返回学习书')
          }
        })
      }
      .hideTitleBar(true)
      .backgroundColor(LociTokens.SCREEN)
      .onShown((): void => this.syncCurrentPage('workspace'))
    } else if (name === 'review') {
      NavDestination() {
        ReviewPage({
          project: (param as LociReviewNav).project,
          returnLabel: (param as LociReviewNav).returnLabel,
          appState: this.appState,
          onBack: (): void => this.popImmersive()
        })
      }
      .hideTitleBar(true)
      .backgroundColor(LociTokens.SCREEN)
      .onShown((): void => this.syncCurrentPage('review'))
    } else if (name === 'summary') {
      NavDestination() {
        SummaryPage({
          project: param as LociProjectSummary,
          onBack: (): void => this.popImmersive(),
          onOpenReview: (project: LociProjectSummary): void =>
            this.openReview(project, '返回全书总结'),
          onCreate: (): void => this.openCreate(),
          onGoToday: (): void => {
            this.currentPage = 'today'
            this.pathStack.popToIndex(0)
            this.pathStack.replacePath({ name: 'today' })
          }
        })
      }
      .hideTitleBar(true)
      .backgroundColor(LociTokens.SCREEN)
      .onShown((): void => this.syncCurrentPage('summary'))
    } else if (name === 'overview') {
      NavDestination() {
        ProjectOverviewPage({
          project: param as LociProjectSummary,
          appState: this.appState,
          onBack: (): void => this.popImmersive(),
          onOpenWorkspace: (project: LociProjectSummary, chapterId: string): void => {
            const latest: LociProjectSummary = this.appState.projects.find(
              (entry: LociProjectSummary): boolean => entry.id === project.id) ?? project
            this.openWorkspace(latest, chapterId)
          },
          onRetryProject: (project: LociProjectSummary): void => this.retryProject(project)
        })
      }
      .hideTitleBar(true)
      .backgroundColor(LociTokens.SCREEN)
      .onShown((): void => this.syncCurrentPage('overview'))
    } else {
      NavDestination() {
        TodayPage({
          appState: this.appState,
          onCreate: (): void => this.openCreate(),
          onOpenProject: (project: LociProjectSummary): void => this.openProject(project),
          onOpenReview: (project: LociProjectSummary): void => this.openReview(project, '返回今日')
        })
      }
      .hideTitleBar(true)
      .backgroundColor(LociTokens.SCREEN)
      .onShown((): void => this.syncCurrentPage('today'))
    }
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Navigation(this.pathStack) {
      }
      .navDestination(this.pageMap)
      .hideTitleBar(true)
      .hideToolBar(true)
      .mode(NavigationMode.Stack)

      if (this.currentPage === 'today' || this.currentPage === 'library') {
        Column() {
          LociIdentityBar({ onOpenMenu: (): void => {
            this.menuOpen = true
          } })
        }
        .width('100%')
        .padding({ top: 22 })
        // 实机核对发现:HitTestMode.Transparent 会让整个顶栏(含菜单触发区)吃不到触摸,
        // 菜单永远打不开。顶栏只占顶部一条,用 Default 即可,不会挡页面内容。
        .hitTestBehavior(HitTestMode.Default)
      }

      if (this.menuOpen) {
        LociMenuOverlay({
          current: this.currentPage,
          onNavigate: (name: string): void => this.navigatePrimary(name),
          onClose: (): void => {
            this.menuOpen = false
          }
        })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(LociTokens.SCREEN)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
