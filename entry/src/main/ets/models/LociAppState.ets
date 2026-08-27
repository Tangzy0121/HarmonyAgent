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
import { LociFixtureData, LociProjectSummary, LociRecommendation } from './LociFixtures'
import { DataMode, ServerConfig } from '../network/ServerConfig'
import {
  ChapterGenerationCallbacks,
  ChapterGenerationSession,
  LociApiClient,
  WireFeynmanResult,
  WireLearnerProfile,
  WireProgressResult,
  WireQuizAttemptResult,
  WireReviewDueItem,
  WireReviewResult,
  WireStoredBook
} from '../loci/data/LociApiClient'
import { mapBooksToProjects, mapBookToProject } from '../loci/data/ServerProjectMapper'
import { deriveTodayRecommendations } from '../loci/data/TodayRecommendation'
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

  private api: LociApiClient = new LociApiClient()
  /** server 来源项目 id:openProject 据此决定进工作区前是否拉详情。 */
  private serverProjectIds: Set<string> = new Set()

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
        // M5d:今日推荐本地派生;失败/为空保持 fixture 推荐
        const derived: LociRecommendation[] = await this.loadServerRecommendations(books)
        if (derived.length > 0) {
          this.recommendations = derived
          console.info(`[loci] load: derived recommendations=${derived.length}`)
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
    answerId: string): Promise<WireQuizAttemptResult> {
    return this.api.submitQuizAttempt(bookId, blockId, answerId)
  }

  /** M5c:费曼讲述写回(无 key 时 503 feynman_not_configured)。 */
  async submitFeynman(bookId: string, chapterId: string,
    explanation: string): Promise<WireFeynmanResult> {
    return this.api.submitFeynman(bookId, chapterId, explanation)
  }

  /** M5c:阅读进度上报(visit/bookmark/unbookmark,幂等)。 */
  async reportProgress(bookId: string, chapterId: string,
    action: string): Promise<WireProgressResult> {
    return this.api.reportProgress(bookId, chapterId, action)
  }

  /** M5c:章节生成 SSE;cancel 由 WorkspacePage 在切章/退页时调用。 */
  startChapterGeneration(bookId: string, chapterId: string,
    callbacks: ChapterGenerationCallbacks): ChapterGenerationSession {
    return this.api.startChapterGeneration(bookId, chapterId, callbacks)
  }

  /** M5e:Chat 轮次会话(agentTurns SSE);WorkspacePage 持有并 observe。 */
  createAgentTurnSession(): LociAgentTurnSession {
    return new LociAgentTurnSession(new LociAgentTurnClient())
  }

  /** M5d:到期复习队列(ReviewPage 组队;失败抛错由调用侧 toast)。 */
  async getReviewDue(bookId: string): Promise<WireReviewDueItem[]> {
    return this.api.getReviewDue(bookId)
  }

  /** M5d:flash_cards 复习自评写回(quiz 块的复习写回走 submitQuizAttempt)。 */
  async submitReviewResult(bookId: string, blockId: string, result: string): Promise<WireReviewResult> {
    return this.api.submitReviewResult(bookId, blockId, result)
  }

  /** M5d:拉原始 wire 书(ReviewPage 需要 flash_cards/quiz 块原文,mapper 不落 flash 块);失败返回 undefined。 */
  async getServerBook(id: string): Promise<WireStoredBook | undefined> {
    try {
      return await this.api.getBook(id)
    } catch (error) {
      return undefined
    }
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
