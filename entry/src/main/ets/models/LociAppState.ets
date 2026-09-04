/**
 * LociAppState(@ObservedV2):M1 全局数据状态;M5a 起支持 server 数据源。
 * 真源:plan.md「LociAppState:加载 lociFixtures.json,提供 projects/recommendations」。
 * DATA_MODE(SERVER|FIXTURE|AUTO,见 ServerConfig):
 * - FIXTURE:同步读 rawfile lociFixtures.json(原 M1 行为)
 * - SERVER:只走 server,失败即 error 页
 * - AUTO:health 探活(3s 短超时)→ 成功则 getBooks 经 ServerProjectMapper 投影;
 *   失败回退 fixture 并打 degraded 标记(今日页顶部降级提示条)
 * recommendations:server 路径由 TodayRecommendation.ets 本地派生
 * (learner/profile + 各书 review/due 并发拉取);派生为空或拉取失败回退 fixture 推荐。
 */
import { util } from '@kit.ArkTS'
import { common } from '@kit.AbilityKit'
import { LociFixtureData } from './LociFixtures'
import { LociLearningBlock, LociProjectSummary, LociRecommendation } from './LociModels'
import {
  LociChapterGenerationCallbacks,
  LociChapterGenerationSession,
  LociFeynmanSubmissionResult,
  LociProgressSnapshot,
  LociQuizSubmissionResult,
  LociReviewQueueItem
} from './LociServiceModels'
import { DataMode, ServerConfig } from '../network/ServerConfig'
import {
  ChapterGenerationCallbacks,
  ChapterGenerationSession,
  LociApiClient,
  WireBookBlock,
  WireFeynmanResult,
  WireLearnerProfile,
  WireProgressResult,
  WireQuizAttemptResult,
  WireReviewDueItem,
  WireAggregatedConcept,
  WireAggregatedRelation,
  WireLearningProject,
  WireProjectNotice,
  WireStoredBook,
  WireTodayResponse
} from '../loci/data/LociApiClient'
import { applyProjectDtos, cloneProject, enrichProjectGraph, mapBooksToProjects, mapBookToProject, mapNoticeToBanner, mapWireBlock } from '../loci/data/ServerProjectMapper'
import { mapReviewQueue } from '../loci/data/ReviewQueueMapper'
import { deriveTodayRecommendations, mapServerTodayRecommendations } from '../loci/data/TodayRecommendation'
import { LociAgentTurnClient } from '../loci/agent/LociAgentTurnClient'
import { LociAgentTurnSession } from '../loci/agent/LociAgentTurnSession'

export type LociLoadPhase = 'loading' | 'ready' | 'error'

@ObservedV2
export class LociAppState {
  @Trace phase: LociLoadPhase = 'loading'
  @Trace errorMessage: string = ''
  @Trace projects: LociProjectSummary[] = []
  @Trace recommendations: LociRecommendation[] = []
  /** AUTO 探活失败回退 fixture 时为 true,今日页据此显示降级提示条。 */
  @Trace degraded: boolean = false

  private api: LociApiClient
  /** server 来源项目 id:openProject 据此决定进工作区前是否拉详情。 */
  private serverProjectIds: Set<string> = new Set()
  /** PR-C:来自服务端 /api/today 的推荐 id;仅这些 id 的三键动作回写 /api/today/state。 */
  private serverTodayIds: Set<string> = new Set()
  /** PR-C:/api/today 不可用(404/旧 server)时 false,回退本地派生且不再重复尝试。 */
  private todayApiAvailable: boolean = true

  constructor(api: LociApiClient = new LociApiClient()) {
    this.api = api
  }

  async load(context: common.UIAbilityContext): Promise<void> {
    this.phase = 'loading'
    // fixture 始终先读:recommendations 来源 + AUTO 回退底;读失败则两边都没数据,走 error。
    let fixture: LociFixtureData | null = null
    try {
      fixture = this.readFixture(context)
    } catch (error) {
      this.phase = 'error'
      this.errorMessage = error instanceof Error ? error.message : 'lociFixtures.json 读取失败'
      return
    }
    this.recommendations = fixture.recommendations ?? []

    const mode: DataMode = ServerConfig.DATA_MODE
    console.info(`[loci] load: mode=${mode}`)
    if (mode === DataMode.FIXTURE) {
      this.applyFixture(fixture)
      return
    }
    const reachable: boolean = mode === DataMode.SERVER ? true : await this.api.health()
    console.info(`[loci] load: reachable=${reachable}`)
    if (reachable) {
      try {
        const books: WireStoredBook[] = await this.api.getBooks()
        console.info(`[loci] load: server books=${books.length}`)
        this.serverProjectIds = new Set(books.map((book: WireStoredBook): string => book.id))
        this.projects = mapBooksToProjects(books)
        // PR-A:聚合 DTO 增强(最近学习排序/状态/标签);失败保持 getBooks 投影
        try {
          const projectDtos: WireLearningProject[] = await this.api.getProjects()
          this.projects = applyProjectDtos(this.projects, projectDtos)
        } catch (error) {
          console.warn(`[loci] load: /api/projects unavailable, keep books projection`)
        }
        // PR-D:未读通知挂到项目 banner;失败静默
        await this.loadServerNotices()
        // PR-C:今日推荐优先服务端 /api/today(确定性零 LLM);失败/为空回退本地派生,再空保持 fixture
        this.serverTodayIds = new Set()
        const serverRecs: LociRecommendation[] = await this.loadServerTodayRecommendations()
        if (serverRecs.length > 0) {
          this.recommendations = serverRecs
          this.serverTodayIds = new Set(serverRecs.map((item: LociRecommendation): string => item.id))
          console.info(`[loci] load: server today recommendations=${serverRecs.length}`)
        } else {
          const derived: LociRecommendation[] = await this.loadServerRecommendations(books)
          if (derived.length > 0) {
            this.recommendations = derived
            console.info(`[loci] load: derived recommendations=${derived.length}`)
          }
        }
        this.degraded = false
        this.errorMessage = ''
        this.phase = 'ready'
        return
      } catch (error) {
        if (mode === DataMode.SERVER) {
          this.phase = 'error'
          this.errorMessage =
            error instanceof Error ? error.message : 'server 数据加载失败'
          return
        }
        // AUTO:拿到列表前出错同样回退 fixture
      }
    }
    this.applyFixture(fixture)
    this.degraded = mode === DataMode.AUTO
    console.info(`[loci] load: fallback fixture projects=${this.projects.length} degraded=${this.degraded}`)
  }

  /** M5b:新建的书确认后登记进 server id 集,后续进工作区走详情拉取路径。 */
  registerServerProject(id: string): void {
    this.serverProjectIds.add(id)
  }

  /** M5c:是否 server 来源项目(工作区据此切换真实写回/SSE 生成,fixture 项目保持本地行为)。 */
  isServerProject(id: string): boolean {
    return this.serverProjectIds.has(id)
  }

  /**
   * M5c:写回(attempts/feynman/progress/章节生成)成功后重拉详情;
   * 返回最新投影,失败返回 undefined(ensureProjectDetail 内部静默),调用侧保留现状。
   */
  async refreshProject(id: string): Promise<LociProjectSummary | undefined> {
    await this.ensureProjectDetail(id)
    return this.projects.find((entry: LociProjectSummary): boolean => entry.id === id)
  }

  /** M5c:quiz 作答写回(无 LLM key 时 diagnosis=null,其余正常落盘)。 */
  async submitQuizAttempt(bookId: string, blockId: string,
    answerId: string): Promise<LociQuizSubmissionResult> {
    const result: WireQuizAttemptResult = await this.api.submitQuizAttempt(bookId, blockId, answerId)
    return {
      isCorrect: result.attempt.isCorrect,
      advice: result.diagnosis?.advice ?? ''
    } as LociQuizSubmissionResult
  }

  /** M5c:费曼讲述写回(无 key 时 503 feynman_not_configured)。 */
  async submitFeynman(bookId: string, chapterId: string,
    explanation: string): Promise<LociFeynmanSubmissionResult> {
    const result: WireFeynmanResult = await this.api.submitFeynman(bookId, chapterId, explanation)
    return {
      passed: result.passed,
      feedback: result.feedback,
      gap: result.gap
    } as LociFeynmanSubmissionResult
  }

  /** M5c:阅读进度上报(visit/bookmark/unbookmark,幂等)。 */
  async reportProgress(bookId: string, chapterId: string,
    action: string): Promise<LociProgressSnapshot> {
    const result: WireProgressResult = await this.api.reportProgress(bookId, chapterId, action)
    return {
      visitedChapterIds: result.progress.visitedChapterIds ?? [],
      bookmarkedChapterIds: result.progress.bookmarkedChapterIds ?? []
    } as LociProgressSnapshot
  }

  /** M5c:章节生成 SSE;cancel 由 WorkspacePage 在切章/退页时调用。 */
  startChapterGeneration(bookId: string, chapterId: string,
    callbacks: LociChapterGenerationCallbacks): LociChapterGenerationSession {
    const wireCallbacks: ChapterGenerationCallbacks = {
      onChapterStart: callbacks.onChapterStart,
      onBlock: (index: number, block: WireBookBlock): void => {
        const mapped: LociLearningBlock | null = mapWireBlock(block)
        if (mapped !== null) {
          callbacks.onBlock(index, mapped)
        }
      },
      onChapterDone: callbacks.onChapterDone,
      onError: callbacks.onError
    }
    const session: ChapterGenerationSession =
      this.api.startChapterGeneration(bookId, chapterId, wireCallbacks)
    return { done: session.done, cancel: (): void => session.cancel() }
  }

  /** M5e:Chat 轮次会话(agentTurns SSE);WorkspacePage 持有并 observe。 */
  createAgentTurnSession(): LociAgentTurnSession {
    return new LociAgentTurnSession(new LociAgentTurnClient())
  }

  /** 页面只消费稳定队列模型，Wire DTO 在数据层完成投影。 */
  async getReviewQueue(bookId: string): Promise<LociReviewQueueItem[]> {
    const due: WireReviewDueItem[] = await this.api.getReviewDue(bookId)
    let book: WireStoredBook | undefined = undefined
    try {
      book = await this.api.getBook(bookId)
    } catch (error) {
      book = undefined
    }
    return mapReviewQueue(due, book)
  }

  /** M5d:flash_cards 复习自评写回(quiz 块的复习写回走 submitQuizAttempt)。 */
  async submitReviewResult(bookId: string, blockId: string, result: string): Promise<void> {
    await this.api.submitReviewResult(bookId, blockId, result)
  }

  /**
   * M5d:今日推荐本地派生——learner/profile + 各书 review/due 并发拉取后走纯函数;
   * 任一来源失败降级(profile→null、due→空),整体异常返回空数组(调用侧保持 fixture)。
   */
  private async loadServerRecommendations(books: WireStoredBook[]): Promise<LociRecommendation[]> {
    try {
      const profilePromise: Promise<WireLearnerProfile | null> = this.api.getLearnerProfile()
        .catch((): null => null)
      const duePromises: Promise<WireReviewDueItem[]>[] = books.map(
        (book: WireStoredBook): Promise<WireReviewDueItem[]> =>
          this.api.getReviewDue(book.id).catch((): WireReviewDueItem[] => []))
      const profile: WireLearnerProfile | null = await profilePromise
      const dueLists: WireReviewDueItem[][] = await Promise.all(duePromises)
      const dueByProject: Map<string, WireReviewDueItem[]> = new Map()
      books.forEach((book: WireStoredBook, index: number): void => {
        dueByProject.set(book.id, dueLists[index] ?? [])
      })
      return deriveTodayRecommendations(this.projects, profile, dueByProject, new Date())
    } catch (error) {
      console.warn(`[loci] load: derive recommendations failed, keep fixture`)
      return []
    }
  }

  /**
   * PR-C:服务端今日推荐。/api/today 一次不可达(旧 server 无此路由)记 todayApiAvailable=false,
   * 本次会话后续直接回退本地派生;返回空数组由调用侧走 M5d 派生路径。
   */
  private async loadServerTodayRecommendations(): Promise<LociRecommendation[]> {
    if (!this.todayApiAvailable) {
      return []
    }
    try {
      const response: WireTodayResponse = await this.api.getTodayRecommendations()
      return mapServerTodayRecommendations(response, this.projects)
    } catch (error) {
      this.todayApiAvailable = false
      console.warn(`[loci] load: /api/today unavailable, fallback to local derive`)
      return []
    }
  }

  /** PR-C:今日推荐三键状态回写(仅服务端来源的推荐;fire-and-forget,失败仅记日志)。 */
  private postTodayState(id: string, state: string): void {
    if (!this.serverTodayIds.has(id)) {
      return
    }
    this.api.setTodayRecommendationState(id, state)
      .catch((error: Object): void => {
        console.warn(`[loci] today state post failed: id=${id} state=${state}`)
      })
  }

  /** 「开始」→ completed;本地移除该卡,下次 load 服务端也不再下发。 */
  completeRecommendation(id: string): void {
    this.postTodayState(id, 'completed')
    this.recommendations = this.recommendations.filter(
      (item: LociRecommendation): boolean => item.id !== id)
  }

  /** 「换一个」→ dismissed(换出的卡今日不再出现)。 */
  dismissRecommendation(id: string): void {
    this.postTodayState(id, 'dismissed')
  }

  /** 「稍后」→ snoozed(服务端默认 4h 后回来)。 */
  snoozeRecommendation(id: string): void {
    this.postTodayState(id, 'snoozed')
  }

  /** 拉详情并原位更新 projects;失败时静默保留列表投影(调用侧照常进工作区)。 */
  async ensureProjectDetail(id: string): Promise<void> {
    if (!this.serverProjectIds.has(id)) {
      return
    }
    try {
      const book: WireStoredBook = await this.api.getBook(id)
      this.upsertProject(mapBookToProject(book))
    } catch (error) {
      // 详情拉取失败不阻断导航,工作区以列表投影进入(章节块为空由消费侧兜底)
      return
    }
    // PR-B:概念图数据源切聚合端点(mastery 投影 + 关系纠正);失败保持详情投影
    try {
      const concepts: WireAggregatedConcept[] = await this.api.getBookConcepts(id)
      const relations: WireAggregatedRelation[] = await this.api.getBookRelations(id)
      const current: LociProjectSummary | undefined = this.projects.find(
        (entry: LociProjectSummary): boolean => entry.id === id)
      if (current !== undefined) {
        this.upsertProject(enrichProjectGraph(current, concepts, relations))
      }
    } catch (error) {
      console.warn(`[loci] detail: concepts/relations unavailable, keep block projection`)
    }
  }

  /** PR-D:未读通知按 target.bookId 挂到项目 banner(每项目取列表首条=最新);失败静默。 */
  private async loadServerNotices(): Promise<void> {
    try {
      const notices: WireProjectNotice[] = await this.api.getNotices()
      const seen: Set<string> = new Set()
      notices.forEach((notice: WireProjectNotice): void => {
        if (notice.readAt !== null) {
          return
        }
        const bookId: string = notice.target.bookId ?? ''
        if (bookId.length === 0 || seen.has(bookId)) {
          return
        }
        const index: number = this.projects.findIndex(
          (entry: LociProjectSummary): boolean => entry.id === bookId)
        if (index < 0) {
          return
        }
        seen.add(bookId)
        const next: LociProjectSummary = cloneProject(this.projects[index])
        next.notice = mapNoticeToBanner(notice)
        const projects: LociProjectSummary[] = this.projects.slice()
        projects[index] = next
        this.projects = projects
      })
    } catch (error) {
      console.warn(`[loci] load: /api/notices unavailable, skip banners`)
    }
  }

  /** PR-D:banner 关闭 → 服务端标记已读(fire-and-forget),本地摘除。 */
  dismissNotice(noticeId: string, projectId: string): void {
    this.api.markNoticeRead(noticeId)
      .catch((error: Object): void => {
        console.warn(`[loci] notice read post failed: id=${noticeId}`)
      })
    const index: number = this.projects.findIndex(
      (entry: LociProjectSummary): boolean => entry.id === projectId)
    if (index >= 0 && this.projects[index].notice?.id === noticeId) {
      const next: LociProjectSummary = cloneProject(this.projects[index])
      next.notice = undefined
      const projects: LociProjectSummary[] = this.projects.slice()
      projects[index] = next
      this.projects = projects
    }
  }

  /** PR-B:概念关系纠正写回(confirm/reject);成功 true,调用侧随后 refreshProject 刷新概念图。 */
  async correctRelation(bookId: string, relationId: string, action: string): Promise<boolean> {
    try {
      await this.api.postRelationCorrection(bookId, relationId, action)
      return true
    } catch (error) {
      console.warn(`[loci] relation correction failed: relation=${relationId} action=${action}`)
      return false
    }
  }

  /** confirm_plan 落地:已有项目原位更新,新项目插到最前(按最近学习时间)。 */
  upsertProject(project: LociProjectSummary): void {
    const index: number = this.projects.findIndex((entry: LociProjectSummary): boolean =>
      entry.id === project.id)
    if (index >= 0) {
      const next: LociProjectSummary[] = this.projects.slice()
      next[index] = project
      this.projects = next
    } else {
      this.projects = [project, ...this.projects]
    }
  }

  private readFixture(context: common.UIAbilityContext): LociFixtureData {
    const bytes: Uint8Array = context.resourceManager.getRawFileContentSync('lociFixtures.json')
    const text: string = util.TextDecoder.create('utf-8').decodeToString(bytes)
    return JSON.parse(text) as LociFixtureData
  }

  private applyFixture(fixture: LociFixtureData): void {
    this.serverProjectIds = new Set()
    this.projects = fixture.projects ?? []
    this.errorMessage = ''
    this.phase = 'ready'
  }
}
