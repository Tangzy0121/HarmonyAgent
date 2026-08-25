/**
 * 学习书工作区 WorkspacePage(M3)
 * 真源:prototype/src/pages/WorkspacePage.tsx;docs/product/03 §7;
 * 视觉基准:HelpCC/harmony-migration/baseline/05-workspace.png。
 * 分层(docs/03 §7.1,同页共存不复制状态):
 *   内容层 = 正文(六类学习块 + 章末总结)| 概念图;
 *   导航层 = ChapterRail 抽屉;助手层 = ChatPanel 全屏层;证据层 = SourceViewer 全屏层。
 *   覆盖层均为页内条件渲染,不做路由跳转,关闭后原块与滚动位置天然保留(docs/03 §12)。
 * 空章/生成中/生成失败章节显示对应状态面板,不崩(fixture 第三章 blocks 为空)。
 * M4:头部「更多」与目录抽屉接 ProjectOverviewPage;章末总结复习出口接 ReviewPage;
 * Chat 建议动作「确认创建」追加会话内复习概念(Mock)。
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
import { LearningBlockView } from '../components/workspace/LearningBlocks'
import { ChapterRail } from '../components/workspace/ChapterRail'
import { ChapterSummary } from '../components/workspace/ChapterSummary'
import { ConceptGraph } from '../components/workspace/ConceptGraph'
import { ChatPanel, LociChatMessage, LOCI_CHAT_MOCK_REPLY, LOCI_CHAT_WELCOME } from '../components/overlays/ChatPanel'
import { SourceViewer } from '../components/overlays/SourceViewer'

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
  /** M4:Chat 建议动作「确认创建」追加的复习概念 id(Mock,会话内有效)。 */
  @Local private extraReviewIds: string[] = []

  aboutToAppear(): void {
    const initial: LociChapter | undefined = this.project.chapters.find(
      (chapter: LociChapter): boolean => chapter.id === this.initialChapterId)
    const last: LociChapter | undefined = this.project.chapters.find(
      (chapter: LociChapter): boolean => chapter.id === this.project.lastChapterId)
    this.activeChapterId = (initial ?? last ?? this.project.chapters[0])?.id ?? ''
    this.chatMessages = [{ id: 'chat-welcome', role: 'assistant', body: LOCI_CHAT_WELCOME }]
  }

  private currentChapter(): LociChapter | undefined {
    return this.project.chapters.find((chapter: LociChapter): boolean =>
      chapter.id === this.activeChapterId) ?? this.project.chapters[0]
  }

  private activeAnchor(): LociSourceAnchor | undefined {
    return (this.project.anchors ?? []).find((anchor: LociSourceAnchor): boolean =>
      anchor.id === this.sourceAnchorId)
  }

  private openChat(scope: string, label: string): void {
    this.chatScope = scope
    this.chatLabel = label
    this.chatOpen = true
  }

  /** Mock 回复:逐字搬原型固定回复;引用只保留当前项目真实存在的 anchor。 */
  private sendChat(body: string): void {
    const stamp: number = Date.now()
    const anchorIds: string[] = (this.project.anchors ?? []).map(
      (anchor: LociSourceAnchor): string => anchor.id)
    const cited: string[] = ['src-loss', 'src-eval'].filter((id: string): boolean =>
      anchorIds.includes(id))
    const userMessage: LociChatMessage = { id: `user-${stamp}`, role: 'user', body: body }
    const assistantMessage: LociChatMessage = {
      id: `assistant-${stamp}`,
      role: 'assistant',
      body: LOCI_CHAT_MOCK_REPLY,
      sourceIds: cited.length > 0 ? cited : undefined
    }
    this.chatMessages = [...this.chatMessages, userMessage, assistantMessage]
  }

  private openSource(anchorId: string): void {
    const found: LociSourceAnchor | undefined = (this.project.anchors ?? []).find(
      (anchor: LociSourceAnchor): boolean => anchor.id === anchorId)
    if (found === undefined) {
      promptAction.showToast({ message: '这个来源在当前项目不可用', duration: 1800 })
      return
    }
    this.sourceAnchorId = anchorId
  }

  private setChapter(chapterId: string): void {
    this.activeChapterId = chapterId
    this.chapterMenuOpen = false
  }

  /**
   * M4:Chat 建议动作「确认创建」落地(Mock)。
   * 卡片文案固定为「把"损失与泛化"加入下一次复习」,这里把损失函数概念
   * 追加进会话内复习队列(章末总结 chips 可见),接 server 时替换为真实复习任务创建。
   */
  private confirmChatAction(): void {
    if (!this.extraReviewIds.includes('loss-function')) {
      this.extraReviewIds = this.extraReviewIds.concat(['loss-function'])
    }
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() {
        this.header()
        this.modeToolbar()

        if (this.project.chapters.length === 0) {
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
                  project: this.project,
                  chapterId: this.activeChapterId,
                  onBackToContent: (): void => {
                    this.workspaceMode = 'content'
                  },
                  onAskAgent: (concept: LociConcept): void =>
                    this.openChat('concept', `概念 · ${concept.label}`),
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
          project: this.project,
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
          projectTitle: this.project.title,
          messages: this.chatMessages,
          onSend: (body: string): void => this.sendChat(body),
          onOpenSource: (anchorId: string): void => this.openSource(anchorId),
          onClose: (): void => {
            this.chatOpen = false
          },
          onConfirmAction: (): void => this.confirmChatAction()
        })
      }

      // 证据层:来源查看器(最上层,可从 Chat/引用/概念详情进入)
      if (this.sourceAnchorId.length > 0 && this.activeAnchor() !== undefined) {
        SourceViewer({
          sourceName: this.project.source.name,
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
        Text(this.project.shortTitle ?? this.project.title)
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

        // 收藏(几何书签)
        Stack() {
          Path({ width: 24, height: 24, commands: 'M7 4h10v16l-5-4.2-5 4.2z' })
            .fill(Color.Transparent)
            .stroke(LociTokens.INK)
            .strokeWidth(1.4)
        }
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .accessibilityText('收藏当前章节')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => {
          promptAction.showToast({ message: '章节收藏将在后续里程碑提供', duration: 1800 })
        })

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

      if (this.currentChapter()?.taskState === 'running') {
        this.chapterStatePanel('✦', '正在生成', '这一章还在组织内容',
          '已有章节和学习记录不受影响。你可以离开，完成后会在学习库出现项目通知。', '阅读已有章节')
      } else if (this.currentChapter()?.taskState === 'failed') {
        this.chapterStatePanel('⚠', '部分可用', '这一章生成失败了',
          '已有内容、笔记和学习证据都已保留。重试只从当前失败阶段继续。', '重新生成本章')
      } else if (this.currentChapter()?.taskState === 'pending') {
        this.chapterStatePanel('◷', '等待生成', '这一章排在生成队列里',
          '前面的章节生成完成后会接着生成这一章。你可以先阅读已有章节。', '阅读已有章节')
      } else if ((this.currentChapter()?.blocks ?? []).length === 0) {
        this.chapterStatePanel('◷', '即将可读', '内容即将可读',
          '这一章的内容还在整理。返回章节目录可以查看其他章节。', '')
      } else {
        ForEach(this.currentChapter()?.blocks ?? [], (block: LociLearningBlock) => {
          LearningBlockView({
            block: block,
            onOpenSource: (anchorId: string): void => this.openSource(anchorId),
            onSelectionAction: (): void => this.openChat('selection', '选中文字 · 当前章节')
          })
        }, (block: LociLearningBlock): string => block.id)

        ChapterSummary({
          project: this.project,
          chapter: this.currentChapter() as LociChapter,
          extraReviewConceptIds: this.extraReviewIds,
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
          chapter?.blocks?.[0]?.sourceIds[0] ?? this.project.anchors?.[0]?.id
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
            if (actionLabel === '重新生成本章') {
              promptAction.showToast({ message: '重新生成将在后续里程碑接入', duration: 1800 })
            } else {
              const ready: LociChapter | undefined = this.project.chapters.find(
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
