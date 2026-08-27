/**
 * 学习书工作区 WorkspacePage(M3)
 * 真源:prototype/src/pages/WorkspacePage.tsx;docs/product/03 §7;
 * 视觉基准:HelpCC/harmony-migration/baseline/05-workspace.png。
 * 分层(docs/03 §7.1,同页共存不复制状态):
 *   内容层 = 正文(六类学习块 + 章末总结)| 概念图;
 *   导航层 = ChapterRail 抽屉;助手层 = ChatPanel 全屏层;证据层 = SourceViewer 全屏层。
 *   覆盖层均为页内条件渲染,不做路由跳转,关闭后原块与滚动位置天然保留(docs/03 §12)。
 * 空章/生成中/生成失败章节显示对应状态面板,不崩(fixture 第三章 blocks 为空)。
 * M4:头部「更多」与目录抽屉接 ProjectOverviewPage;章末总结复习出口接 ReviewPage。
 * M5c(server 项目,fixture 行为不变):
 *   页内持有 detail 工作副本(@Param project 是导航快照,写回后由 refreshFromServer 重拉);
 *   pending/failed 章可「生成本章/重新生成本章」→ SSE 逐块渐进渲染,切章/退页 cancel;
 *   quiz/feynman 写回 attempts/feynman 端点;切章 visit 防抖 800ms 上报;
 *   顶栏书签 bookmark/unbookmark 乐观更新 + 失败回滚。
 * M5e:Chat 接真实 agentTurns(LociAgentTurnSession):content_delta 逐字 append、
 *   citation → 引用 chips(过滤项目 anchors)、user_question → 确认卡片(POST answers)、
 *   turn_failed/断线 → toast + 重试;关面板 cancel 端点;作用域条 chapter⇄project 切换;
 *   fixture 项目发送只回「演示模式未连接服务」提示(灭 mock#3 + toast#5)。
 */
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../theme/LociTokens'
import {
  LociChapter,
  LociConcept,
  LociLearningBlock,
  LociProjectSummary,
  LociSourceAnchor,
  LOCI_EMPTY_PROJECT,
  chapterTaskStateLabel,
  chatScopeLabel
} from '../models/LociFixtures'
import { LociAppState } from '../models/LociAppState'
import {
  ChapterGenerationSession,
  WireBookBlock,
  WireFeynmanResult,
  WireProgressResult,
  WireQuizAttemptResult
} from '../loci/data/LociApiClient'
import { mapWireBlock } from '../loci/data/ServerProjectMapper'
import {
  FeynmanOutcome,
  LearningBlockView,
  QuizAnswerOutcome
} from '../components/workspace/LearningBlocks'
import { ChapterRail } from '../components/workspace/ChapterRail'
import { ChapterSummary } from '../components/workspace/ChapterSummary'
import { ConceptGraph } from '../components/workspace/ConceptGraph'
import { ChatPanel, LociChatMessage, LOCI_CHAT_FIXTURE_HINT, LOCI_CHAT_WELCOME } from '../components/overlays/ChatPanel'
import { SourceViewer } from '../components/overlays/SourceViewer'
import { AgentTurnCitation, AgentTurnQuestion, AgentTurnRequest } from '../loci/agent/LociAgentTurnClient'
import { LociAgentTurnSession } from '../loci/agent/LociAgentTurnSession'

function taskStateColor(state: string): string {
  switch (state) {
    case 'ready': return LociTokens.SUCCESS
    case 'running': return LociTokens.ACCENT
    case 'failed': return LociTokens.DANGER
    default: return LociTokens.INK_MUTED
  }
}

/** AppRoot pushPath 的 param 形状:项目 + 可选定位章节(概览「打开」直达)。 */
export interface LociWorkspaceNav {
  project: LociProjectSummary
  chapterId: string
}

@ComponentV2
export struct WorkspacePage {
  @Param project: LociProjectSummary = LOCI_EMPTY_PROJECT
  /** M4:从项目概览「打开」章节进入时定位到指定章,空串走 lastChapterId 兜底。 */
  @Param initialChapterId: string = ''
  /** M5c:server 项目判定 + 写回 API(AppRoot 注入;fixture 项目只读 isServerProject=false)。 */
  @Param appState: LociAppState = new LociAppState()
  @Event onBack: () => void = (): void => {}
  /** M4:头部「更多」/ 目录抽屉 → ProjectOverviewPage(由 AppRoot 路由)。 */
  @Event onOpenOverview: () => void = (): void => {}
  /** M4:章末总结复习出口 → ReviewPage(由 AppRoot 路由)。 */
  @Event onOpenReview: () => void = (): void => {}

  @Local private workspaceMode: string = 'content' // 'content' | 'graph'
  @Local private activeChapterId: string = ''
  @Local private chapterMenuOpen: boolean = false
  @Local private chatOpen: boolean = false
  @Local private chatScope: string = 'chapter'
  @Local private chatLabel: string = ''
  @Local private chatMessages: LociChatMessage[] = []
  @Local private sourceAnchorId: string = ''
  /** M5e:Chat 轮次会话状态(由 LociAgentTurnSession.observe 同步进来驱动 UI)。 */
  @Local private chatPhase: string = 'idle'
  @Local private chatPendingQuestion: AgentTurnQuestion | null = null
  @Local private chatErrorText: string = ''
  /** M5e:concept 作用域的概念 id(概念图「问 loci」带入)。 */
  private chatConceptId: string = ''
  /** M5e:轮次会话(非 @Local,UI 态经 observe 同步);关面板/切作用域置 null。 */
  private chatSession: LociAgentTurnSession | null = null
  /** M5e:本轮助手气泡 id(content_delta 逐字更新它)。 */
  private chatAssistantId: string = ''
  /** M5e:error 相位 toast 只弹一次(发送新消息时复位)。 */
  private chatErrorToasted: boolean = false
  /** M5c:页内项目工作副本(渲染一律走它,@Param project 只是进入时快照)。 */
  @Local private detail: LociProjectSummary = LOCI_EMPTY_PROJECT
  /** M5c:章节生成会话状态(generatingChapterId 非空 = 正在渐进渲染该章)。 */
  @Local private generatingChapterId: string = ''
  @Local private generatingBlocks: LociLearningBlock[] = []
  private genSession: ChapterGenerationSession | null = null
  /** M5c:visit 防抖计时器(-1 = 无)。 */
  private visitTimer: number = -1

  aboutToAppear(): void {
    this.detail = this.project
    const initial: LociChapter | undefined = this.detail.chapters.find(
      (chapter: LociChapter): boolean => chapter.id === this.initialChapterId)
    const last: LociChapter | undefined = this.detail.chapters.find(
      (chapter: LociChapter): boolean => chapter.id === this.detail.lastChapterId)
    this.activeChapterId = (initial ?? last ?? this.detail.chapters[0])?.id ?? ''
    this.chatMessages = [{ id: 'chat-welcome', role: 'assistant', body: LOCI_CHAT_WELCOME }]
    this.scheduleVisit(this.activeChapterId)
  }

  aboutToDisappear(): void {
    this.cancelGeneration()
    this.clearVisitTimer()
    this.cancelChatSession()
  }

  /** M5c:server 来源项目才走真实写回/SSE;fixture 项目全部保持原本地行为。 */
  private serverBacked(): boolean {
    return this.appState.isServerProject(this.detail.id)
  }

  private currentChapter(): LociChapter | undefined {
    return this.detail.chapters.find((chapter: LociChapter): boolean =>
      chapter.id === this.activeChapterId) ?? this.detail.chapters[0]
  }

  private activeAnchor(): LociSourceAnchor | undefined {
    return (this.detail.anchors ?? []).find((anchor: LociSourceAnchor): boolean =>
      anchor.id === this.sourceAnchorId)
  }

  private openChat(scope: string, label: string, conceptId: string = ''): void {
    this.chatScope = scope
    this.chatLabel = label
    this.chatConceptId = conceptId
    this.chatOpen = true
  }

  // ---- M5e:Chat 接 agentTurns ----

  private ensureChatSession(): LociAgentTurnSession {
    if (this.chatSession === null) {
      const session: LociAgentTurnSession = this.appState.createAgentTurnSession()
      session.observe((): void => this.syncChatFromSession())
      this.chatSession = session
    }
    return this.chatSession
  }

  /** 断流 + cancel 端点(静默);关面板/切作用域/退页共用。 */
  private cancelChatSession(): void {
    const session: LociAgentTurnSession | null = this.chatSession
    this.chatSession = null
    if (session !== null) {
      session.cancel()
    }
    this.chatPhase = 'idle'
    this.chatPendingQuestion = null
    this.chatErrorText = ''
    this.chatAssistantId = ''
  }

  /** 会话状态 → @Local(UI 驱动);assistant 气泡逐字更新,引用过滤到项目 anchors。 */
  private syncChatFromSession(): void {
    const session: LociAgentTurnSession | null = this.chatSession
    if (session === null) {
      return
    }
    this.chatPhase = session.phase
    this.chatPendingQuestion = session.pendingQuestion
    this.chatErrorText = session.errorMessage
    if (session.phase === 'error' && !this.chatErrorToasted) {
      this.chatErrorToasted = true
      promptAction.showToast({
        message: session.errorMessage.length > 0 ? session.errorMessage : '学习助手生成失败,请重试。',
        duration: 2200
      })
    }
    if (this.chatAssistantId.length === 0) {
      return
    }
    const assistantId: string = this.chatAssistantId
    let body: string = session.bodyText
    if (body.length === 0 && session.activities.length > 0) {
      // 内容未出时显示最新活动标签(如「正在核对学习上下文」)
      body = `✦ ${session.activities[session.activities.length - 1]}`
    }
    const anchorIds: string[] = (this.detail.anchors ?? []).map(
      (anchor: LociSourceAnchor): string => anchor.id)
    const cited: string[] = []
    session.citations.forEach((citation: AgentTurnCitation): void => {
      const candidate: string = citation.anchorCandidate
      if (anchorIds.includes(candidate) && !cited.includes(candidate)) {
        cited.push(candidate)
      }
    })
    this.chatMessages = this.chatMessages.map((message: LociChatMessage): LociChatMessage => {
      if (message.id !== assistantId) {
        return message
      }
      return {
        id: message.id,
        role: message.role,
        body: body,
        sourceIds: cited.length > 0 ? cited : undefined
      } as LociChatMessage
    })
  }

  /** refs 按 ChatScope 填:chapter/selection→章节;concept→概念;project/其他→项目。 */
  private buildTurnRequest(message: string): AgentTurnRequest {
    let chapterId: string = ''
    let conceptId: string = ''
    if (this.chatScope === 'chapter' || this.chatScope === 'selection') {
      chapterId = this.activeChapterId
    } else if (this.chatScope === 'concept') {
      conceptId = this.chatConceptId
    }
    return new AgentTurnRequest(message, 'learning', this.detail.id, chapterId, '', conceptId)
  }

  /** 发送:server 项目开 agentTurns 轮;fixture 项目只回演示提示(灭 mock#3)。 */
  private sendChat(body: string): void {
    const stamp: number = Date.now()
    const userMessage: LociChatMessage = { id: `user-${stamp}`, role: 'user', body: body }
    if (!this.serverBacked()) {
      const hintMessage: LociChatMessage = {
        id: `assistant-${stamp}`,
        role: 'assistant',
        body: LOCI_CHAT_FIXTURE_HINT
      }
      this.chatMessages = [...this.chatMessages, userMessage, hintMessage]
      return
    }
    if (body.length > 2000) {
      promptAction.showToast({ message: '问题太长,请控制在 2000 字以内', duration: 1800 })
      return
    }
    const session: LociAgentTurnSession = this.ensureChatSession()
    if (session.hasOpenTurn()) {
      return // 进行中轮次不允许并发开轮(输入框已禁用,双保险)
    }
    this.chatAssistantId = `assistant-${stamp}`
    this.chatErrorToasted = false
    const assistantMessage: LociChatMessage = {
      id: this.chatAssistantId,
      role: 'assistant',
      body: ''
    }
    this.chatMessages = [...this.chatMessages, userMessage, assistantMessage]
    session.start(this.buildTurnRequest(body))
  }

  /** 回答 agent 提问(POST answers 恢复 SSE)。 */
  private answerChatQuestion(answer: string): void {
    if (this.chatSession !== null) {
      this.chatSession.answer(answer)
    }
  }

  /** error 相位重发上一条消息。 */
  private retryChat(): void {
    if (this.chatSession !== null) {
      this.chatErrorToasted = false
      this.chatSession.retry()
    }
  }

  /** toast#5:作用域 chapter⇄project 切换;进行中的轮按旧 refs 取消,下条消息用新 refs。 */
  private switchChatScope(): void {
    const next: string = this.chatScope === 'chapter' ? 'project' : 'chapter'
    this.chatScope = next
    const chapter: LociChapter | undefined = this.currentChapter()
    this.chatLabel = next === 'project'
      ? `当前项目 · ${this.detail.title}`
      : (chapter?.title ?? '当前章节')
    if (this.chatSession !== null && this.chatSession.hasOpenTurn()) {
      this.cancelChatSession()
    }
    promptAction.showToast({
      message: `已切换到${next === 'project' ? '当前项目' : '当前章节'}作用域`,
      duration: 1500
    })
  }

  private closeChat(): void {
    this.chatOpen = false
    this.cancelChatSession()
  }

  private openSource(anchorId: string): void {
    const found: LociSourceAnchor | undefined = (this.detail.anchors ?? []).find(
      (anchor: LociSourceAnchor): boolean => anchor.id === anchorId)
    if (found === undefined) {
      promptAction.showToast({ message: '这个来源在当前项目不可用', duration: 1800 })
      return
    }
    this.sourceAnchorId = anchorId
  }

  private setChapter(chapterId: string): void {
    if (chapterId !== this.activeChapterId) {
      // 生成中切章:取消底层请求(server 会中止并把该章翻 error,可稍后重新生成)
      this.cancelGeneration()
    }
    this.activeChapterId = chapterId
    this.chapterMenuOpen = false
    this.scheduleVisit(chapterId)
  }

  // ---- M5c:章节生成 SSE ----

  /** pending/failed 章「生成本章/重新生成本章」入口;非 server 项目不触发。 */
  private startGeneration(chapter: LociChapter): void {
    if (!this.serverBacked() || this.genSession !== null) {
      return
    }
    const bookId: string = this.detail.id
    const chapterId: string = chapter.id
    this.generatingChapterId = chapterId
    this.generatingBlocks = []
    const session: ChapterGenerationSession = this.appState.startChapterGeneration(bookId, chapterId, {
      onChapterStart: (startedChapterId: string): void => {
        if (this.generatingChapterId === chapterId) {
          this.generatingBlocks = []
        }
      },
      onBlock: (index: number, block: WireBookBlock): void => {
        if (this.generatingChapterId !== chapterId) {
          return
        }
        const mapped: LociLearningBlock | null = mapWireBlock(block)
        if (mapped !== null) {
          this.generatingBlocks = this.generatingBlocks.concat([mapped])
        }
      },
      onChapterDone: (blockCount: number, warnings: string[]): void => {
        // 终态帧;块以刷新后的服务端落盘为准(finishGeneration 重拉详情)
      },
      onError: (code: string, message: string): void => {
        // 终态错误帧:server 已把章翻 error;done 正常结束后统一刷新 + toast
      }
    })
    this.genSession = session
    session.done
      .then((): void => {
        this.finishGeneration(session, '')
      })
      .catch((error: Object): void => {
        // incomplete_stream / 网络错误 / 前置校验 409/503:已落盘部分经刷新呈现
        this.finishGeneration(session, error instanceof Error ? error.message : '生成中断,请重试')
      })
  }

  /** 会话结束(含 server error 帧):重拉详情,章态/块/概念图以服务端落盘为准。 */
  private finishGeneration(session: ChapterGenerationSession, errorMessage: string): void {
    if (this.genSession !== session) {
      return // 已被切章/退页取消,且可能已有新会话,不得清新会话状态
    }
    this.genSession = null
    this.generatingChapterId = ''
    this.generatingBlocks = []
    if (errorMessage.length > 0) {
      promptAction.showToast({ message: errorMessage, duration: 2200 })
    }
    this.refreshFromServer()
  }

  private cancelGeneration(): void {
    const session: ChapterGenerationSession | null = this.genSession
    if (session !== null) {
      this.genSession = null
      session.cancel()
    }
    this.generatingChapterId = ''
    this.generatingBlocks = []
  }

  /** M5c:写回后重拉 server 详情并原位替换工作副本(mapper 重投影概念状态/证据条)。 */
  private refreshFromServer(): void {
    const bookId: string = this.detail.id
    this.appState.refreshProject(bookId)
      .then((latest: LociProjectSummary | undefined): void => {
        if (latest !== undefined && latest.id === bookId) {
          this.detail = latest
        }
      })
  }

  // ---- M5c:quiz / feynman 写回 ----

  private handleQuizAnswer(blockId: string, answerId: string): Promise<QuizAnswerOutcome> {
    return this.appState.submitQuizAttempt(this.detail.id, blockId, answerId)
      .then((result: WireQuizAttemptResult): QuizAnswerOutcome => {
        this.refreshFromServer()
        return {
          isCorrect: result.attempt.isCorrect,
          advice: result.diagnosis?.advice ?? ''
        } as QuizAnswerOutcome
      })
  }

  private handleFeynmanSubmit(explanation: string): Promise<FeynmanOutcome> {
    const chapterId: string = this.activeChapterId
    return this.appState.submitFeynman(this.detail.id, chapterId, explanation)
      .then((result: WireFeynmanResult): FeynmanOutcome => {
        this.refreshFromServer()
        return {
          passed: result.passed,
          feedback: result.feedback,
          gap: result.gap
        } as FeynmanOutcome
      })
  }

  // ---- M5c:阅读进度(visit 防抖 + 书签乐观更新) ----

  private clearVisitTimer(): void {
    if (this.visitTimer >= 0) {
      clearTimeout(this.visitTimer)
      this.visitTimer = -1
    }
  }

  /** 切章 visit 防抖 800ms 上报;fixture 项目不上报。 */
  private scheduleVisit(chapterId: string): void {
    if (!this.serverBacked() || chapterId.length === 0) {
      return
    }
    this.clearVisitTimer()
    this.visitTimer = setTimeout((): void => {
      this.visitTimer = -1
      this.appState.reportProgress(this.detail.id, chapterId, 'visit')
        .then((result: WireProgressResult): void => this.applyProgress(result))
        .catch((): void => {
          promptAction.showToast({ message: '阅读进度未同步,稍后会重试', duration: 1800 })
        })
    }, 800)
  }

  /** 顶栏书签:乐观更新 + 失败回滚(fixture 保持原 toast)。 */
  private toggleBookmark(): void {
    const chapter: LociChapter | undefined = this.currentChapter()
    if (chapter === undefined) {
      return
    }
    if (!this.serverBacked()) {
      promptAction.showToast({ message: '章节收藏将在后续里程碑提供', duration: 1800 })
      return
    }
    const chapterId: string = chapter.id
    const next: boolean = chapter.bookmarked !== true
    this.applyBookmarkLocal(chapterId, next)
    this.appState.reportProgress(this.detail.id, chapterId, next ? 'bookmark' : 'unbookmark')
      .then((result: WireProgressResult): void => this.applyProgress(result))
      .catch((error: Object): void => {
        this.applyBookmarkLocal(chapterId, !next)
        promptAction.showToast({
          message: error instanceof Error ? error.message : '收藏失败,请重试',
          duration: 2000
        })
      })
  }

  /** 以 server 响应的 progress 为准,重建章节 read/bookmarked 标记。 */
  private applyProgress(result: WireProgressResult): void {
    const visited: string[] = result.progress.visitedChapterIds ?? []
    const bookmarked: string[] = result.progress.bookmarkedChapterIds ?? []
    const chapters: LociChapter[] = this.detail.chapters.map((chapter: LociChapter): LociChapter => {
      const next: LociChapter = chapter
      next.read = visited.includes(chapter.id)
      next.bookmarked = bookmarked.includes(chapter.id)
      return next
    })
    this.detail = this.cloneWithChapters(chapters)
  }

  private applyBookmarkLocal(chapterId: string, bookmarked: boolean): void {
    const chapters: LociChapter[] = this.detail.chapters.map((chapter: LociChapter): LociChapter => {
      if (chapter.id !== chapterId) {
        return chapter
      }
      const next: LociChapter = chapter
      next.bookmarked = bookmarked
      return next
    })
    this.detail = this.cloneWithChapters(chapters)
  }

  /**
   * 换新 chapters 的 detail 副本。@Local 只对引用变化触发更新,
   * 必须造新对象(写法对齐 AppRoot.retryProject 的显式逐字段复制)。
   */
  private cloneWithChapters(chapters: LociChapter[]): LociProjectSummary {
    return {
      id: this.detail.id,
      title: this.detail.title,
      shortTitle: this.detail.shortTitle,
      goal: this.detail.goal,
      level: this.detail.level,
      depth: this.detail.depth,
      source: this.detail.source,
      status: this.detail.status,
      lastStudiedLabel: this.detail.lastStudiedLabel,
      chapters: chapters,
      notice: this.detail.notice,
      lastChapterId: this.detail.lastChapterId,
      concepts: this.detail.concepts,
      relations: this.detail.relations,
      anchors: this.detail.anchors,
      evidence: this.detail.evidence,
      reviewConceptIds: this.detail.reviewConceptIds
    } as LociProjectSummary
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() {
        this.header()
        this.modeToolbar()

        if (this.detail.chapters.length === 0) {
          // 兜底:没有章节的项目不应进入工作区(preparing 在路由层已拦截)
          Column({ space: LociTokens.SPACE_3 }) {
            Text('这本学习书还没有章节')
              .fontSize(LociTokens.FONT_TITLE)
              .fontColor(LociTokens.INK)
            Text('项目方案确认后，章节会出现在这里。')
              .fontSize(12)
              .fontColor(LociTokens.INK_SOFT)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding({ top: LociTokens.SPACE_8 })
        } else {
          Scroll() {
            Column() {
              if (this.workspaceMode === 'graph') {
                ConceptGraph({
                  project: this.detail,
                  chapterId: this.activeChapterId,
                  onBackToContent: (): void => {
                    this.workspaceMode = 'content'
                  },
                  onAskAgent: (concept: LociConcept): void =>
                    this.openChat('concept', `概念 · ${concept.label}`, concept.id),
                  onOpenSource: (anchorId: string): void => this.openSource(anchorId)
                })
              } else {
                this.reader()
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
          }
          .width('100%')
          .layoutWeight(1)
          .scrollBar(BarState.Off)
          .align(Alignment.Top)
        }
      }
      .width('100%')
      .height('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X })

      // 导航层:章节目录抽屉
      if (this.chapterMenuOpen) {
        ChapterRail({
          project: this.detail,
          activeChapterId: this.activeChapterId,
          onSelectChapter: (chapterId: string): void => this.setChapter(chapterId),
          onClose: (): void => {
            this.chapterMenuOpen = false
          },
          onOpenOverview: (): void => {
            this.chapterMenuOpen = false
            this.onOpenOverview()
          }
        })
      }

      // 助手层:Chat 全屏层
      if (this.chatOpen) {
        ChatPanel({
          chatLabel: this.chatLabel,
          scopeText: chatScopeLabel(this.chatScope),
          projectTitle: this.detail.title,
          messages: this.chatMessages,
          phase: this.chatPhase,
          pendingQuestion: this.chatPendingQuestion,
          errorText: this.chatErrorText,
          onSend: (body: string): void => this.sendChat(body),
          onOpenSource: (anchorId: string): void => this.openSource(anchorId),
          onClose: (): void => this.closeChat(),
          onAnswer: (answer: string): void => this.answerChatQuestion(answer),
          onRetry: (): void => this.retryChat(),
          onSwitchScope: (): void => this.switchChatScope()
        })
      }

      // 证据层:来源查看器(最上层,可从 Chat/引用/概念详情进入)
      if (this.sourceAnchorId.length > 0 && this.activeAnchor() !== undefined) {
        SourceViewer({
          sourceName: this.detail.source.name,
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

  /** 沉浸页头:返回 + 章节标题(中) + 目录/收藏/更多(右)。 */
  @Builder
  private header() {
    Stack({ alignContent: Alignment.Center }) {
      Column({ space: 2 }) {
        Text('学习书工作区')
          .fontSize(10)
          .fontColor(LociTokens.INK_MUTED)
        Text(this.detail.shortTitle ?? this.detail.title)
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Center)
      .padding({ left: 72, right: 132 })

      Row() {
        Text('←')
          .fontSize(18)
          .fontColor(LociTokens.INK)
          .textAlign(TextAlign.Center)
          .width(LociTokens.CONTROL_MIN)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityText('返回学习库')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onBack())
        Blank()

        // 章节目录(几何三线)
        Column({ space: 4 }) {
          Rect().width(16).height(1.5).fill(LociTokens.INK)
          Rect().width(16).height(1.5).fill(LociTokens.INK)
          Rect().width(16).height(1.5).fill(LociTokens.INK)
        }
        .justifyContent(FlexAlign.Center)
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityText('打开章节目录')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => {
          this.chapterMenuOpen = true
        })

        // 收藏(几何书签);M5c:server 章接 bookmark/unbookmark,已收藏填桃色
        Stack() {
          Path({ width: 24, height: 24, commands: 'M7 4h10v16l-5-4.2-5 4.2z' })
            .fill(this.currentChapter()?.bookmarked === true ? LociTokens.ACCENT : Color.Transparent)
            .stroke(this.currentChapter()?.bookmarked === true ? LociTokens.ACCENT : LociTokens.INK)
            .strokeWidth(1.4)
        }
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityText('收藏当前章节')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.toggleBookmark())

        // 更多(三点)
        Row({ space: 4 }) {
          Circle().width(3).height(3).fill(LociTokens.INK)
          Circle().width(3).height(3).fill(LociTokens.INK)
          Circle().width(3).height(3).fill(LociTokens.INK)
        }
        .justifyContent(FlexAlign.Center)
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityText('更多学习书操作')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onOpenOverview())
      }
      .width('100%')
    }
    .width('100%')
    .height(52)
    .margin({ top: 28 })
  }

  /** 工具条:正文|概念图 切换 + Chat 作用域 chip。 */
  @Builder
  private modeToolbar() {
    Row() {
      Row({ space: LociTokens.SPACE_5 }) {
        this.modeTab('content', '正文')
        this.modeTab('graph', '概念图')
      }
      Blank()
      Row({ space: 5 }) {
        Text('✦')
          .fontSize(11)
          .fontColor(LociTokens.INK_SOFT)
        Text(`Chat 作用域:${this.workspaceMode === 'graph' ? '当前学习书' : '当前章节'}`)
          .fontSize(11)
          .fontColor(LociTokens.INK_SOFT)
      }
      .height(LociTokens.CONTROL_MIN)
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => {
        const chapter: LociChapter | undefined = this.currentChapter()
        if (this.workspaceMode === 'graph') {
          this.openChat('concept', '当前学习书 · 概念图')
        } else {
          this.openChat('chapter', chapter?.title ?? '当前章节')
        }
      })
    }
    .width('100%')
    .border({ width: { bottom: 1 }, color: LociTokens.LINE })
  }

  @Builder
  private modeTab(mode: string, label: string) {
    Column({ space: 6 }) {
      Row({ space: 5 }) {
        if (mode === 'content') {
          // 书形图标
          Row({ space: 1 }) {
            Rect().width(5).height(8).radius(1)
              .fill(Color.Transparent)
              .stroke(this.workspaceMode === mode ? LociTokens.INK : LociTokens.INK_MUTED)
              .strokeWidth(1.1)
            Rect().width(5).height(8).radius(1)
              .fill(Color.Transparent)
              .stroke(this.workspaceMode === mode ? LociTokens.INK : LociTokens.INK_MUTED)
              .strokeWidth(1.1)
          }
        } else {
          // 概念图图标:三连点
          Stack() {
            Circle().width(3.5).height(3.5)
              .fill(this.workspaceMode === mode ? LociTokens.INK : LociTokens.INK_MUTED)
              .translate({ x: -4, y: 3 })
            Circle().width(3.5).height(3.5)
              .fill(this.workspaceMode === mode ? LociTokens.INK : LociTokens.INK_MUTED)
              .translate({ x: 4, y: 3 })
            Circle().width(3.5).height(3.5)
              .fill(this.workspaceMode === mode ? LociTokens.INK : LociTokens.INK_MUTED)
              .translate({ x: 0, y: -3.5 })
          }
          .width(11)
          .height(9)
        }
        Text(label)
          .fontSize(13)
          .fontWeight(this.workspaceMode === mode ? FontWeight.Medium : FontWeight.Normal)
          .fontColor(this.workspaceMode === mode ? LociTokens.INK : LociTokens.INK_MUTED)
      }
      Rect()
        .width('100%')
        .height(1)
        .fill(this.workspaceMode === mode ? LociTokens.INK : Color.Transparent)
    }
    // 实机核对发现:不约束宽度时 tab Column 会撑满整行并居中,还会把「概念图」tab
    // 和 Chat chip 挤出屏幕。固定 88vp 宽度后三个元素各就各位。
    .width(88)
    .height(LociTokens.CONTROL_MIN)
    .justifyContent(FlexAlign.Center)
    .accessibilityRole(AccessibilityRoleType.BUTTON)
    .accessibilityDescription(`${label}模式`)
    .onClick((): void => {
      this.workspaceMode = mode
    })
  }

  /** 正文模式:章节头 + 状态面板 / 学习块 + 章末总结。 */
  @Builder
  private reader() {
    Column() {
      this.chapterHero()

      if (this.generatingChapterId === this.activeChapterId) {
        // M5c:SSE 渐进渲染——逐块 append,终态后 finishGeneration 重拉详情接管
        Column({ space: LociTokens.SPACE_2 }) {
          Text(`✦ 正在生成,已产出 ${this.generatingBlocks.length} 块…`)
            .fontSize(12)
            .fontColor(LociTokens.ACCENT)
            .width('100%')
            .margin({ top: LociTokens.SPACE_4, bottom: LociTokens.SPACE_2 })
          Text('切换章节或离开页面会中止生成,已生成的内容会保留。')
            .fontSize(11)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
        }
        ForEach(this.generatingBlocks, (block: LociLearningBlock) => {
          LearningBlockView({
            block: block,
            onOpenSource: (anchorId: string): void => this.openSource(anchorId),
            onSelectionAction: (): void => this.openChat('selection', '选中文字 · 当前章节'),
            serverBacked: this.serverBacked(),
            onSubmitAnswer: (blockId: string, answerId: string): Promise<QuizAnswerOutcome> =>
              this.handleQuizAnswer(blockId, answerId),
            onSubmitFeynman: (explanation: string): Promise<FeynmanOutcome> =>
              this.handleFeynmanSubmit(explanation)
          })
        }, (block: LociLearningBlock): string => block.id)
      } else if (this.currentChapter()?.taskState === 'running') {
        this.chapterStatePanel('✦', '正在生成', '这一章还在组织内容',
          '已有章节和学习记录不受影响。你可以离开，完成后会在学习库出现项目通知。', '阅读已有章节')
      } else if (this.currentChapter()?.taskState === 'failed') {
        this.chapterStatePanel('⚠', '部分可用', '这一章生成失败了',
          '已有内容、笔记和学习证据都已保留。重试只从当前失败阶段继续。', '重新生成本章')
      } else if (this.currentChapter()?.taskState === 'pending') {
        if (this.serverBacked()) {
          // M5c:server 书章不会自动排队生成,进入后由用户显式触发(避免误耗 LLM 调用)
          this.chapterStatePanel('◷', '等待生成', '这一章还没有生成',
            '点击下面按钮开始生成本章内容,生成过程会逐块展示。', '生成本章')
        } else {
          this.chapterStatePanel('◷', '等待生成', '这一章排在生成队列里',
            '前面的章节生成完成后会接着生成这一章。你可以先阅读已有章节。', '阅读已有章节')
        }
      } else if ((this.currentChapter()?.blocks ?? []).length === 0) {
        this.chapterStatePanel('◷', '即将可读', '内容即将可读',
          '这一章的内容还在整理。返回章节目录可以查看其他章节。', '')
      } else {
        ForEach(this.currentChapter()?.blocks ?? [], (block: LociLearningBlock) => {
          LearningBlockView({
            block: block,
            onOpenSource: (anchorId: string): void => this.openSource(anchorId),
            onSelectionAction: (): void => this.openChat('selection', '选中文字 · 当前章节'),
            serverBacked: this.serverBacked(),
            onSubmitAnswer: (blockId: string, answerId: string): Promise<QuizAnswerOutcome> =>
              this.handleQuizAnswer(blockId, answerId),
            onSubmitFeynman: (explanation: string): Promise<FeynmanOutcome> =>
              this.handleFeynmanSubmit(explanation)
          })
        }, (block: LociLearningBlock): string => block.id)

        ChapterSummary({
          project: this.detail,
          chapter: this.currentChapter() as LociChapter,
          extraReviewConceptIds: [],
          onSelectChapter: (chapterId: string): void => this.setChapter(chapterId),
          onAskAgent: (): void => {
            const chapter: LociChapter | undefined = this.currentChapter()
            this.openChat('chapter', chapter?.title ?? '当前章节')
          },
          onOpenSource: (anchorId: string): void => this.openSource(anchorId),
          onOpenReview: (): void => this.onOpenReview()
        })
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** 章节头:任务态徽标 + 第 N 章·时长 + 标题 + 学习目标 + 阅读/验证 + 来源范围。 */
  @Builder
  private chapterHero() {
    Column() {
      Row() {
        Row({ space: 5 }) {
          Circle().width(6).height(6).fill(taskStateColor(this.currentChapter()?.taskState ?? ''))
          Text(chapterTaskStateLabel(this.currentChapter()?.taskState ?? ''))
            .fontSize(11)
            .fontColor(taskStateColor(this.currentChapter()?.taskState ?? ''))
        }
        Blank()
        Text(`第 ${(this.currentChapter()?.order ?? 0) + 1} 章 · ${this.currentChapter()?.estimatedMinutes ?? 0} 分钟`)
          .fontSize(11)
          .fontColor(LociTokens.INK_MUTED)
      }
      .width('100%')

      Text(this.currentChapter()?.title ?? '')
        .fontSize(LociTokens.FONT_PAGE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-1.5)
        .lineHeight(46)
        .width('100%')
        .margin({ top: LociTokens.SPACE_4 })

      Text(this.currentChapter()?.objective ?? '这一章的学习目标将在生成后显示。')
        .fontSize(LociTokens.FONT_BODY)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(24)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })

      Text(`${this.currentChapter()?.read === true ? '已读' : '未读'} · ${this.currentChapter()?.verified === true ? '已验证' : '未验证'}`)
        .fontSize(10)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })

      // 来源范围:跳来源查看器(第一章块来源,缺省回退到项目第一个 anchor)
      Row({ space: 6 }) {
        Stack() {
          Rect().width(10).height(12).radius(1)
            .fill(Color.Transparent).stroke(LociTokens.ACCENT).strokeWidth(1.2)
          Line().width(5).height(1).startPoint([0, 0]).endPoint([5, 0])
            .stroke(LociTokens.ACCENT).strokeWidth(1).translate({ y: -1.5 })
          Line().width(5).height(1).startPoint([0, 0]).endPoint([5, 0])
            .stroke(LociTokens.ACCENT).strokeWidth(1).translate({ y: 2 })
        }
        .width(10)
        .height(12)
        Text(`来源范围:${this.currentChapter()?.sourceRange ?? '待定'}`)
          .fontSize(12)
          .fontColor(LociTokens.ACCENT)
      }
      .height(LociTokens.CONTROL_MIN)
      .margin({ top: LociTokens.SPACE_2 })
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .onClick((): void => {
        const chapter: LociChapter | undefined = this.currentChapter()
        const anchorId: string | undefined =
          chapter?.blocks?.[0]?.sourceIds[0] ?? this.detail.anchors?.[0]?.id
        if (anchorId !== undefined) {
          this.openSource(anchorId)
        }
      })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_5, bottom: LociTokens.SPACE_6 })
  }

  /** 章节状态面板:生成中/失败/等待/空章,真源:WorkspacePage.tsx chapter-state。 */
  @Builder
  private chapterStatePanel(icon: string, eyebrow: string, title: string, body: string,
    actionLabel: string) {
    Column({ space: LociTokens.SPACE_3 }) {
      Text(icon)
        .fontSize(22)
        .fontColor(LociTokens.ACCENT)
        .width('100%')
        .margin({ top: LociTokens.SPACE_7 })
      Text(eyebrow)
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text(title)
        .fontSize(LociTokens.FONT_SECTION)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .width('100%')
      Text(body)
        .fontSize(13)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(21)
        .width('100%')
      if (actionLabel.length > 0) {
        Text(actionLabel)
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
          .textAlign(TextAlign.Center)
          .height(LociTokens.CONTROL_HEIGHT)
          .padding({ left: 22, right: 22 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .border({ width: 1, color: LociTokens.LINE_STRONG })
          .margin({ top: LociTokens.SPACE_3 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            if (actionLabel === '重新生成本章' || actionLabel === '生成本章') {
              // M5c:server 章接真实生成;fixture 保持原 toast
              const chapter: LociChapter | undefined = this.currentChapter()
              if (this.serverBacked() && chapter !== undefined) {
                this.startGeneration(chapter)
              } else {
                promptAction.showToast({ message: '重新生成将在后续里程碑接入', duration: 1800 })
              }
            } else {
              const ready: LociChapter | undefined = this.detail.chapters.find(
                (chapter: LociChapter): boolean => chapter.taskState === 'ready')
              if (ready !== undefined) {
                this.setChapter(ready.id)
              }
            }
          })
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ bottom: LociTokens.SPACE_8 })
  }
}
