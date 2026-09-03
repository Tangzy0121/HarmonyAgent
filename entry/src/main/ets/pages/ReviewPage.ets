/**
 * 短复习 ReviewPage(M4 原型;M5d server 真实化)
 * 真源:prototype/src/pages/ReviewPage.tsx;docs/product/03 §11、docs/product/02 §4;
 * 视觉基准:HelpCC/harmony-migration/baseline/04-review.png。
 * 队列:fixture 项目 = reviewConceptIds ∩ concepts,5 个封顶(docs/02 §4「3—5 个概念」);
 * server 项目(M5d)= GET review/due 到期块(同 5 封顶),题面从详情拉取的章 blocks 找:
 * quiz 块走答题路径(写回 POST attempts,答错自动入复习调度),
 * flash_cards 块走回忆卡路径(揭示背面后自评,写回 POST review/:blockId/result)。
 * 每概念两步:主动回忆(先遮定义,点击揭示)→ 答题/自评 → 结果反馈(含来源回跳 SourceViewer)。
 * 队列有限、可结束、可稍后:「稍后处理」直接退出且不改数据(server 无推迟端点,保持语义)。
 * 结果页按本次答题分「已巩固 / 仍需复习」两组,不把结果包装成分数(docs/03 §11);
 * server 路径「已保存 N 条」为真实写回成功计数,fixture 保持 Mock 语义不写回。
 * M5d 模拟器实测修复:卡片底栏主按钮从带参 @Builder(cardFooter)改内联——
 * V2 @Builder 参数按值捕获不响应 @Local,enabled 永远停在初值(device-audit.md #3 同类)。
 */
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../theme/LociTokens'
import {
  LociConcept,
  LociProjectSummary,
  LociQuizOption,
  LociSourceAnchor,
  LOCI_EMPTY_PROJECT
} from '../models/LociModels'
import { LociAppState } from '../models/LociAppState'
import {
  LociQuizSubmissionResult,
  LociReviewCard,
  LociReviewQueueItem,
  LociReviewQuiz
} from '../models/LociServiceModels'
import { LociImmersiveHeader } from '../components/create/LociImmersiveHeader'
import { ReviewProgressHeader } from '../components/review/ReviewProgressHeader'
import { SourceViewer } from '../components/overlays/SourceViewer'
import { createFixtureReviewItem } from '../review/FixtureReviewMapper'

/** AppRoot pushPath 的 param 形状:复习入口决定返回按钮文案。 */
export interface LociReviewNav {
  project: LociProjectSummary
  returnLabel: string
}

/** 每概念的第二步题:来自章节 quiz 块,或概念判断 Mock 题(fixture)。 */
/** 复习队列上限,真源:docs/product/02 §4(3—5 个概念)。 */
const REVIEW_QUEUE_CAP: number = 5

/**
 * 注意(device-audit.md #3 + M5d 实测):V2 @Builder 参数按值捕获,不响应 @Local 状态变化
 * ——卡片底栏主按钮必须内联在 recallCard/quizCard 里直接读 this.*(细粒度更新才生效),
 * 不要抽成带参 @Builder(旧 cardFooter/ReviewFooterParam 已因此删除)。
 */
@ComponentV2
export struct ReviewPage {
  @Param project: LociProjectSummary = LOCI_EMPTY_PROJECT
  @Param returnLabel: string = '返回学习书'
  /** M5d:server 项目经 appState 拉到期队列与写回;fixture 项目不消费(保持 M4 行为)。 */
  @Param appState: LociAppState = new LociAppState()
  @Event onBack: () => void = (): void => {}

  @Local private items: LociReviewQueueItem[] = []
  @Local private index: number = 0
  @Local private stage: string = 'recall' // 'recall' | 'quiz' | 'grade' | 'feedback'
  @Local private recallAnswer: string = ''
  @Local private revealed: boolean = false
  @Local private selectedOptionId: string = ''
  @Local private lastCorrect: boolean = false
  @Local private consolidatedIds: string[] = []
  @Local private stillReviewIds: string[] = []
  @Local private sourceAnchorId: string = ''
  /** M5d server:到期队列拉取中。 */
  @Local private loading: boolean = false
  /** M5d server:真实写回成功计数(结果页「已保存 N 条」)。 */
  @Local private savedCount: number = 0
  /** M5d server:写回进行中,防重复提交。 */
  @Local private submitting: boolean = false

  aboutToAppear(): void {
    if (this.isServer()) {
      this.loading = true
      this.loadServerQueue()
      return
    }
    const reviewIds: string[] = this.project.reviewConceptIds ?? []
    this.items = (this.project.concepts ?? []).filter((concept: LociConcept): boolean =>
      reviewIds.includes(concept.id)).slice(0, REVIEW_QUEUE_CAP)
      .map((concept: LociConcept): LociReviewQueueItem => createFixtureReviewItem(this.project, concept))
  }

  private isServer(): boolean {
    return this.appState.isServerProject(this.project.id)
  }

  /**
   * M5d server 组队:GET review/due(≤5)+ GET 详情找块原文;
   * 块缺失的到期项跳过(防御:调度与块不一致时不白屏)。
   */
  private async loadServerQueue(): Promise<void> {
    const bookId: string = this.project.id
    try {
      this.items = await this.appState.getReviewQueue(bookId)
    } catch (error) {
      promptAction.showToast({
        message: error instanceof Error ? error.message : '复习队列加载失败,请稍后重试',
        duration: 1800
      })
    }
    this.loading = false
  }

  private currentItem(): LociReviewQueueItem | undefined {
    return this.items[this.index]
  }

  /** 第二步题(concept/quiz 路径);flash_cards 无题,走 grade 自评。 */
  private currentQuiz(): LociReviewQuiz | null {
    return this.currentItem()?.quiz ?? null
  }

  private isDone(): boolean {
    return this.index >= this.items.length
  }

  private activeAnchor(): LociSourceAnchor | undefined {
    return (this.project.anchors ?? []).find((anchor: LociSourceAnchor): boolean =>
      anchor.id === this.sourceAnchorId)
  }

  /** 稍后处理:退出且不改数据(server 无推迟端点,docs/02 §4 只调整调度语义保留为退出)。 */
  private defer(): void {
    promptAction.showToast({ message: '已稍后处理,复习会重新安排', duration: 1800 })
    this.onBack()
  }

  /** 回忆提交:flash_cards 进自评(揭示背面),其余进答题。 */
  private submitRecall(): void {
    this.stage = this.currentItem()?.kind === 'flash_cards' ? 'grade' : 'quiz'
  }

  /** 答题提交:server quiz 块走 POST attempts(答错自动入复习调度),判分以 server 为准。 */
  private submitQuiz(): void {
    const item: LociReviewQueueItem | undefined = this.currentItem()
    const quiz: LociReviewQuiz | null = this.currentQuiz()
    if (item === undefined || quiz === null) {
      return
    }
    if (this.isServer() && item.kind === 'quiz') {
      if (this.submitting) {
        return
      }
      this.submitting = true
      this.appState.submitQuizAttempt(this.project.id, item.blockId, this.selectedOptionId)
        .then((result: LociQuizSubmissionResult): void => {
          this.submitting = false
          this.savedCount += 1
          this.lastCorrect = result.isCorrect
          this.stage = 'feedback'
          this.appState.refreshProject(this.project.id)
        })
        .catch((error: Object): void => {
          this.submitting = false
          promptAction.showToast({
            message: error instanceof Error ? error.message : '保存失败,请重试', duration: 1800
          })
        })
      return
    }
    this.lastCorrect = this.selectedOptionId === quiz.correctOptionId
    this.stage = 'feedback'
  }

  /** flash_cards 自评:POST review/:blockId/result(remembered 推进调度,forgotten 重置 stage)。 */
  private submitGrade(result: string): void {
    const item: LociReviewQueueItem | undefined = this.currentItem()
    if (item === undefined || this.submitting) {
      return
    }
    this.submitting = true
    this.appState.submitReviewResult(this.project.id, item.blockId, result)
      .then((): void => {
        this.submitting = false
        this.savedCount += 1
        this.lastCorrect = result === 'remembered'
        this.stage = 'feedback'
        this.appState.refreshProject(this.project.id)
      })
      .catch((error: Object): void => {
        this.submitting = false
        promptAction.showToast({
          message: error instanceof Error ? error.message : '保存失败,请重试', duration: 1800
        })
      })
  }

  /** 「下一项 / 查看结果」:记录本项结果(server 已写回;fixture 仅页内),推进队列。 */
  private advance(): void {
    const item: LociReviewQueueItem | undefined = this.currentItem()
    if (item !== undefined) {
      if (this.lastCorrect) {
        this.consolidatedIds = this.consolidatedIds.concat([item.key])
      } else {
        this.stillReviewIds = this.stillReviewIds.concat([item.key])
      }
    }
    this.index += 1
    this.stage = 'recall'
    this.recallAnswer = ''
    this.revealed = false
    this.selectedOptionId = ''
  }

  private labelOf(keys: string[]): string {
    return this.items.filter((item: LociReviewQueueItem): boolean => keys.includes(item.key))
      .map((item: LociReviewQueueItem): string => item.label).join('、')
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() {
        LociImmersiveHeader({
          title: '短复习',
          meta: this.project.title,
          backLabel: '',
          onBack: (): void => this.onBack()
        })

        ReviewProgressHeader({
          current: this.index,
          total: this.items.length,
          done: this.isDone()
        })

        if (this.loading) {
          // M5d server:到期队列拉取中
          Text('正在加载复习队列…')
            .fontSize(LociTokens.FONT_META)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
            .margin({ top: LociTokens.SPACE_7 })
        } else if (this.items.length === 0) {
          this.emptyState()
        } else if (this.isDone()) {
          this.resultView()
        } else {
          Scroll() {
            Column() {
              if (this.stage === 'recall') {
                this.recallCard()
              } else if (this.stage === 'quiz') {
                this.quizCard()
              } else if (this.stage === 'grade') {
                this.gradeCard()
              } else {
                this.feedbackCard()
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
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 28, bottom: LociTokens.SPACE_4 })

      // 证据层:来源查看器(结果反馈的来源回跳)
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

  /** 卡片头:题型 + 概念名(对照 04-review.png 「主动回忆 … 损失函数」)。 */
  @Builder
  private cardHeader(kindLabel: string) {
    Row() {
      Text(kindLabel)
        .fontSize(LociTokens.FONT_LABEL)
        .fontColor(LociTokens.INK_MUTED)
      Blank()
      Text(this.currentItem()?.label ?? '')
        .fontSize(LociTokens.FONT_LABEL)
        .fontColor(LociTokens.INK_MUTED)
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_5 })
  }

  /** 第一步:主动回忆(先遮定义,点击揭示);flash_cards 项先展示卡面。 */
  @Builder
  private recallCard() {
    Column() {
      this.cardHeader('主动回忆')

      Text(this.currentItem()?.kind === 'flash_cards' ?
        '先不看背面:回忆这张卡问的内容,再揭示对照。' :
        `先不看资料:用一两句话说出「${this.currentItem()?.label ?? ''}」在讲什么。`)
        .fontSize(LociTokens.FONT_SECTION)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-0.5)
        .lineHeight(36)
        .width('100%')
        .margin({ top: LociTokens.SPACE_5 })

      if (this.currentItem()?.kind === 'flash_cards') {
        Column({ space: 6 }) {
          ForEach(this.currentItem()?.cards ?? [], (card: LociReviewCard) => {
            Text(card.front)
              .fontSize(LociTokens.FONT_SMALL)
              .fontColor(LociTokens.INK)
              .lineHeight(22)
              .width('100%')
          }, (card: LociReviewCard): string => card.front)
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding(LociTokens.SPACE_4)
        .margin({ top: LociTokens.SPACE_4 })
        .borderRadius(LociTokens.RADIUS_BLOCK)
        .backgroundColor(LociTokens.SURFACE)
      }

      TextArea({ placeholder: '用一两句话回答…', text: this.recallAnswer })
        .width('100%')
        .constraintSize({ minHeight: 96, maxHeight: 160 })
        .fontSize(LociTokens.FONT_SMALL)
        .fontColor(LociTokens.INK)
        .placeholderColor(LociTokens.INK_MUTED)
        .placeholderFont({ size: 14 })
        .caretColor(LociTokens.ACTION)
        .backgroundColor(LociTokens.SURFACE)
        .borderRadius(LociTokens.RADIUS_BLOCK)
        .padding(14)
        .margin({ top: LociTokens.SPACE_5 })
        .accessibilityText('主动回忆回答')
        .onChange((value: string): void => {
          this.recallAnswer = value
        })

      // 遮住的定义:点击揭示后再对照自己的回答
      Column({ space: 6 }) {
        Text(this.revealed ? '资料定义' : '定义已遮住')
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text(this.revealed ? (this.currentItem()?.reveal ?? '') : '点击揭示,对照自己的回答')
          .fontSize(this.revealed ? 14 : 13)
          .fontColor(this.revealed ? LociTokens.INK : LociTokens.INK_MUTED)
          .lineHeight(22)
          .width('100%')
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding(LociTokens.SPACE_4)
      .margin({ top: LociTokens.SPACE_4 })
      .borderRadius(LociTokens.RADIUS_BLOCK)
      .backgroundColor(LociTokens.SURFACE)
      .constraintSize({ minHeight: LociTokens.CONTROL_MIN })
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .accessibilityText(this.revealed ? '资料定义已揭示' : '揭示定义')
      .onClick((): void => {
        this.revealed = true
      })

      // 底栏内联(不走 @Builder 传参):V2 @Builder 参数按值捕获不响应 @Local 变化,
      // enabled 直接读 this.* 由细粒度更新驱动(device-audit.md #3 同款修法)
      Row() {
        Text('稍后处理')
          .fontSize(LociTokens.FONT_META)
          .fontColor(LociTokens.INK_MUTED)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.defer())
        Blank()
        Text('提交回答')
          .fontSize(LociTokens.FONT_META)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.recallAnswer.trim().length > 0 || this.revealed ?
            LociTokens.ACTION_INK : LociTokens.INK_MUTED)
          .textAlign(TextAlign.Center)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: 22, right: 22 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(this.recallAnswer.trim().length > 0 || this.revealed ?
            LociTokens.ACTION : LociTokens.SURFACE)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            if (this.recallAnswer.trim().length > 0 || this.revealed) {
              this.submitRecall()
            }
          })
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
      .padding({ bottom: LociTokens.SPACE_6 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** 第二步:应用或对比题(章节 quiz 块 / 概念判断 Mock 题)。 */
  @Builder
  private quizCard() {
    Column() {
      this.cardHeader(this.currentQuiz()?.kindLabel ?? '应用判断')

      Text(this.currentQuiz()?.question ?? '')
        .fontSize(LociTokens.FONT_SECTION)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-0.5)
        .lineHeight(36)
        .width('100%')
        .margin({ top: LociTokens.SPACE_5 })

      Column({ space: LociTokens.SPACE_3 }) {
        ForEach(this.currentQuiz()?.options ?? [], (option: LociQuizOption) => {
          Row({ space: LociTokens.SPACE_3 }) {
            Stack() {
              Circle()
                .width(14)
                .height(14)
                .fill(Color.Transparent)
                .stroke(this.selectedOptionId === option.id ? LociTokens.ACTION : LociTokens.LINE_STRONG)
                .strokeWidth(1.4)
              if (this.selectedOptionId === option.id) {
                Circle().width(6).height(6).fill(LociTokens.ACTION)
              }
            }
            .width(14)
            .height(14)
            Text(option.label)
              .fontSize(LociTokens.FONT_SMALL)
              .fontColor(this.selectedOptionId === option.id ? LociTokens.INK : LociTokens.INK_SOFT)
              .lineHeight(21)
              .layoutWeight(1)
          }
          .width('100%')
          .padding(LociTokens.SPACE_4)
          .borderRadius(LociTokens.RADIUS_BLOCK)
          .border({
            width: 1,
            color: this.selectedOptionId === option.id ? LociTokens.ACTION : LociTokens.LINE
          })
          .constraintSize({ minHeight: LociTokens.CONTROL_MIN })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            this.selectedOptionId = option.id
          })
        }, (option: LociQuizOption): string => option.id)
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })

      // 底栏内联(同 recallCard,不走 @Builder 传参)
      Row() {
        Text('稍后处理')
          .fontSize(LociTokens.FONT_META)
          .fontColor(LociTokens.INK_MUTED)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.defer())
        Blank()
        Text('提交判断')
          .fontSize(LociTokens.FONT_META)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.selectedOptionId.length > 0 ? LociTokens.ACTION_INK : LociTokens.INK_MUTED)
          .textAlign(TextAlign.Center)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: 22, right: 22 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(this.selectedOptionId.length > 0 ? LociTokens.ACTION : LociTokens.SURFACE)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            if (this.selectedOptionId.length > 0) {
              this.submitQuiz()
            }
          })
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
      .padding({ bottom: LociTokens.SPACE_6 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** flash_cards 第二步:揭示背面后自评(写回 POST review/result)。 */
  @Builder
  private gradeCard() {
    Column() {
      this.cardHeader('记忆自评')

      Column({ space: LociTokens.SPACE_3 }) {
        ForEach(this.currentItem()?.cards ?? [], (card: LociReviewCard) => {
          Column({ space: 6 }) {
            Text(card.front)
              .fontSize(LociTokens.FONT_LABEL)
              .fontColor(LociTokens.INK_MUTED)
              .width('100%')
            Text(card.back)
              .fontSize(LociTokens.FONT_SMALL)
              .fontColor(LociTokens.INK)
              .lineHeight(22)
              .width('100%')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(LociTokens.SPACE_4)
          .borderRadius(LociTokens.RADIUS_BLOCK)
          .backgroundColor(LociTokens.SURFACE)
        }, (card: LociReviewCard): string => card.front)
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })

      Row({ space: LociTokens.SPACE_3 }) {
        Text('没记住')
          .fontSize(LociTokens.FONT_META)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
          .textAlign(TextAlign.Center)
          .layoutWeight(1)
          .height(LociTokens.CONTROL_MIN)
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .border({ width: 1, color: LociTokens.LINE_STRONG })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.submitGrade('forgotten'))
        Text('记住了')
          .fontSize(LociTokens.FONT_META)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.ACTION_INK)
          .textAlign(TextAlign.Center)
          .layoutWeight(1)
          .height(LociTokens.CONTROL_MIN)
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(LociTokens.ACTION)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.submitGrade('remembered'))
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
      .padding({ bottom: LociTokens.SPACE_6 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** 第三步:结果反馈(含来源回跳)。 */
  @Builder
  private feedbackCard() {    Column() {
      this.cardHeader('结果与来源')

      Row({ space: LociTokens.SPACE_3 }) {
        Text(this.lastCorrect ? '✓' : '⚠')
          .fontSize(LociTokens.FONT_SUBTITLE)
          .fontColor(this.lastCorrect ? LociTokens.SUCCESS : LociTokens.WARNING)
        Column({ space: 6 }) {
          Text(this.lastCorrect ? '已保存回答 · 与资料一致' : '已保存回答 · 还需巩固')
            .fontSize(LociTokens.FONT_SMALL)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
            .width('100%')
          Text(this.currentQuiz()?.explanation ?? this.currentItem()?.reveal ?? '')
            .fontSize(LociTokens.FONT_META)
            .fontColor(LociTokens.INK_SOFT)
            .lineHeight(21)
            .width('100%')
          Row({ space: 5 }) {
            Stack() {
              Rect().width(10).height(12).radius(1)
                .fill(Color.Transparent).stroke(LociTokens.ACTION).strokeWidth(1.2)
              Line().width(5).height(1).startPoint([0, 0]).endPoint([5, 0])
                .stroke(LociTokens.ACTION).strokeWidth(1).translate({ y: -1.5 })
              Line().width(5).height(1).startPoint([0, 0]).endPoint([5, 0])
                .stroke(LociTokens.ACTION).strokeWidth(1).translate({ y: 2 })
            }
            .width(10)
            .height(12)
            Text('查看来源与相关正文')
              .fontSize(LociTokens.FONT_LABEL)
              .fontColor(LociTokens.ACTION)
          }
          .height(LociTokens.CONTROL_MIN)
          .margin({ top: LociTokens.SPACE_2 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            const anchorId: string = this.currentItem()?.anchorId ?? ''
            if (anchorId.length > 0) {
              this.sourceAnchorId = anchorId
            } else {
              promptAction.showToast({ message: '这个概念的来源定位仍在生成', duration: 1800 })
            }
          })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      .padding(LociTokens.SPACE_4)
      .margin({ top: LociTokens.SPACE_5 })
      .borderRadius(LociTokens.RADIUS_BLOCK)
      .backgroundColor(LociTokens.SURFACE)

      Row() {
        Text('稍后处理')
          .fontSize(LociTokens.FONT_META)
          .fontColor(LociTokens.INK_MUTED)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.defer())
        Blank()
        Text(this.index === this.items.length - 1 ? '查看结果' : '下一项')
          .fontSize(LociTokens.FONT_META)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.ACTION_INK)
          .textAlign(TextAlign.Center)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: 22, right: 22 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(LociTokens.ACTION)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.advance())
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
      .padding({ bottom: LociTokens.SPACE_6 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** 结果页:已巩固 / 仍需复习分组(不包装成分数,docs/03 §11)。 */
  @Builder
  private resultView() {
    Scroll() {
      Column({ space: LociTokens.SPACE_4 }) {
        Text('✓')
          .fontSize(LociTokens.FONT_SECTION)
          .fontColor(LociTokens.SUCCESS)
          .width('100%')
          .margin({ top: LociTokens.SPACE_6 })
        Text(this.isServer() ? `已保存 ${this.savedCount} 条复习事件` :
          `已保存 ${this.items.length} 条复习事件(Mock)`)
          .fontSize(LociTokens.FONT_CAPTION)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text('先回到学习书继续')
          .fontSize(LociTokens.FONT_SECTION)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .width('100%')
        Text('这次回答会形成新的学习证据。概念状态由全部有效证据重新投影,不会因为一次回答就永久标记掌握。')
          .fontSize(LociTokens.FONT_META)
          .fontColor(LociTokens.INK_SOFT)
          .lineHeight(21)
          .width('100%')

        if (this.consolidatedIds.length > 0) {
          this.resultGroup('已巩固', this.labelOf(this.consolidatedIds), LociTokens.SUCCESS)
        }
        if (this.stillReviewIds.length > 0) {
          this.resultGroup('仍需复习', this.labelOf(this.stillReviewIds), LociTokens.WARNING)
        }

        Row({ space: 6 }) {
          Text(this.returnLabel)
            .fontSize(LociTokens.FONT_SMALL)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.ACTION_INK)
          Text('→')
            .fontSize(LociTokens.FONT_SMALL)
            .fontColor(LociTokens.ACTION_INK)
        }
        .justifyContent(FlexAlign.Center)
        .width('100%')
        .height(LociTokens.CONTROL_HEIGHT)
        .margin({ top: LociTokens.SPACE_3, bottom: LociTokens.SPACE_6 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .backgroundColor(LociTokens.ACTION)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onBack())
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .layoutWeight(1)
    .scrollBar(BarState.Off)
    .align(Alignment.Top)
  }

  @Builder
  private resultGroup(title: string, labels: string, color: string) {
    Column({ space: 6 }) {
      Text(title)
        .fontSize(LociTokens.FONT_CAPTION)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text(labels)
        .fontSize(LociTokens.FONT_SMALL)
        .fontWeight(FontWeight.Medium)
        .fontColor(color)
        .width('100%')
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(LociTokens.SPACE_4)
    .borderRadius(LociTokens.RADIUS_BLOCK)
    .backgroundColor(LociTokens.SURFACE)
  }

  @Builder
  private emptyState() {
    Column({ space: LociTokens.SPACE_3 }) {
      Text(this.isServer() ? '这次没有到期复习' : '这次没有待复习概念')
        .fontSize(LociTokens.FONT_TITLE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .width('100%')
        .margin({ top: LociTokens.SPACE_7 })
      Text(this.isServer() ?
        '到期的小测与闪卡会出现在这里;答错的小测会自动安排复习。' :
        '概念在小测或讲述中暴露薄弱点后会进入复习队列。')
        .fontSize(LociTokens.FONT_META)
        .fontColor(LociTokens.INK_MUTED)
        .lineHeight(20)
        .width('100%')
      Text(this.returnLabel)
        .fontSize(LociTokens.FONT_META)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
        .textAlign(TextAlign.Center)
        .height(LociTokens.CONTROL_HEIGHT)
        .padding({ left: 22, right: 22 })
        .margin({ top: LociTokens.SPACE_3 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .border({ width: 1, color: LociTokens.LINE_STRONG })
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onBack())
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }
}
