/**
 * 短复习 ReviewPage(M4)
 * 真源:prototype/src/pages/ReviewPage.tsx;docs/product/03 §11、docs/product/02 §4;
 * 视觉基准:HelpCC/harmony-migration/baseline/04-review.png。
 * 队列:入口项目 reviewConceptIds ∩ concepts,5 个封顶(docs/02 §4「3—5 个概念」);
 * 每概念两步:主动回忆(先遮定义,点击揭示)→ 应用或对比题(关联章节 quiz 块,
 * 没有则出概念判断 Mock 题)→ 结果反馈(含来源回跳 SourceViewer)。
 * 队列有限、可结束、可稍后:「稍后处理」直接退出且不改数据(Mock 语义:只调整调度)。
 * 结果页按本次答题分「已巩固 / 仍需复习」两组,不把结果包装成分数(docs/03 §11)。
 * Mock 说明:复习事件只记录在页内状态,不写回 appState,接 server 时替换为真实事件流。
 */
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../theme/LociTokens'
import {
  LociConcept,
  LociProjectSummary,
  LociQuizOption,
  LociSourceAnchor,
  LOCI_EMPTY_PROJECT
} from '../models/LociFixtures'
import { LociImmersiveHeader } from '../components/create/LociImmersiveHeader'
import { SourceViewer } from '../components/overlays/SourceViewer'

/** AppRoot pushPath 的 param 形状:复习入口决定返回按钮文案。 */
export interface LociReviewNav {
  project: LociProjectSummary
  returnLabel: string
}

/** 每概念的第二步题:来自章节 quiz 块,或概念判断 Mock 题。 */
interface ReviewQuiz {
  kindLabel: string
  question: string
  options: LociQuizOption[]
  correctOptionId: string
  explanation: string
}

/** 复习队列上限,真源:docs/product/02 §4(3—5 个概念)。 */
const REVIEW_QUEUE_CAP: number = 5

/** cardFooter 的传参对象(V2 @Builder 响应式要求对象字面量传参)。 */
interface ReviewFooterParam {
  enabled: boolean
  actionLabel: string
  action: () => void
}

@ComponentV2
export struct ReviewPage {
  @Param project: LociProjectSummary = LOCI_EMPTY_PROJECT
  @Param returnLabel: string = '返回学习书'
  @Event onBack: () => void = (): void => {}

  @Local private queue: LociConcept[] = []
  @Local private index: number = 0
  @Local private stage: string = 'recall' // 'recall' | 'quiz' | 'feedback'
  @Local private recallAnswer: string = ''
  @Local private revealed: boolean = false
  @Local private selectedOptionId: string = ''
  @Local private lastCorrect: boolean = false
  @Local private consolidatedIds: string[] = []
  @Local private stillReviewIds: string[] = []
  @Local private sourceAnchorId: string = ''

  aboutToAppear(): void {
    const reviewIds: string[] = this.project.reviewConceptIds ?? []
    this.queue = (this.project.concepts ?? []).filter((concept: LociConcept): boolean =>
      reviewIds.includes(concept.id)).slice(0, REVIEW_QUEUE_CAP)
  }

  private currentConcept(): LociConcept | undefined {
    return this.queue[this.index]
  }

  private isDone(): boolean {
    return this.index >= this.queue.length
  }

  /** 应用或对比题:优先该概念关联章节的 quiz 块;没有则出概念判断 Mock 题。 */
  private currentQuiz(): ReviewQuiz | null {
    const concept: LociConcept | undefined = this.currentConcept()
    if (concept === undefined) {
      return null
    }
    for (const chapter of this.project.chapters) {
      for (const block of chapter.blocks ?? []) {
        if (block.type === 'quiz' && block.conceptId === concept.id) {
          return {
            kindLabel: '应用判断',
            question: block.question ?? '',
            options: block.options ?? [],
            correctOptionId: block.correctOptionId ?? '',
            explanation: block.explanation ?? concept.definition
          }
        }
      }
    }
    return {
      kindLabel: '概念判断',
      question: `判断:「${concept.label}」——${concept.definition}`,
      options: [
        { id: 'a', label: '准确,与我的理解一致' } as LociQuizOption,
        { id: 'b', label: '不准确,与我的理解有出入' } as LociQuizOption
      ],
      correctOptionId: 'a',
      explanation: concept.definition
    }
  }

  private activeAnchor(): LociSourceAnchor | undefined {
    return (this.project.anchors ?? []).find((anchor: LociSourceAnchor): boolean =>
      anchor.id === this.sourceAnchorId)
  }

  private conceptAnchorId(concept: LociConcept): string | undefined {
    const first: string | undefined = concept.sourceIds[0]
    const found: LociSourceAnchor | undefined = (this.project.anchors ?? []).find(
      (anchor: LociSourceAnchor): boolean => anchor.id === first)
    return found?.id
  }

  /** 稍后处理:退出且不改数据(Mock 语义:只调整调度,docs/02 §4)。 */
  private defer(): void {
    promptAction.showToast({ message: '已稍后处理,复习会重新安排', duration: 1800 })
    this.onBack()
  }

  private submitRecall(): void {
    this.stage = 'quiz'
  }

  private submitQuiz(): void {
    const quiz: ReviewQuiz | null = this.currentQuiz()
    this.lastCorrect = quiz !== null && this.selectedOptionId === quiz.correctOptionId
    this.stage = 'feedback'
  }

  /** 「下一项 / 查看结果」:记录本概念结果(Mock:仅页内),推进队列。 */
  private advance(): void {
    const concept: LociConcept | undefined = this.currentConcept()
    if (concept !== undefined) {
      if (this.lastCorrect) {
        this.consolidatedIds = this.consolidatedIds.concat([concept.id])
      } else {
        this.stillReviewIds = this.stillReviewIds.concat([concept.id])
      }
    }
    this.index += 1
    this.stage = 'recall'
    this.recallAnswer = ''
    this.revealed = false
    this.selectedOptionId = ''
  }

  private labelOf(ids: string[]): string {
    return this.queue.filter((concept: LociConcept): boolean => ids.includes(concept.id))
      .map((concept: LociConcept): string => concept.label).join('、')
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

        // ---- 进度头:有限任务 · 随时可以退出 + N/M + 进度细线 ----
        Row() {
          Column({ space: 6 }) {
            Text('有限任务 · 随时可以退出')
              .fontSize(12)
              .fontColor(LociTokens.INK_MUTED)
              .width('100%')
            Text(this.isDone() ? '这次复习已经完成' : `${this.index + 1} / ${this.queue.length}`)
              .fontSize(44)
              .fontWeight(FontWeight.Lighter)
              .fontColor(LociTokens.INK)
              .letterSpacing(-1.5)
              .width('100%')
              .accessibilityText(this.isDone() ? '这次复习已经完成' :
                `第 ${this.index + 1} 个概念,共 ${this.queue.length} 个`)
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)

          Stack() {
            Rect().width(64).height(1).fill(LociTokens.LINE_STRONG)
            Rect()
              .width(this.queue.length === 0 ? 0 :
                64 * Math.min(this.index, this.queue.length) / this.queue.length)
              .height(1)
              .fill(LociTokens.INK)
          }
          .width(64)
          .height(24)
          .alignContent(Alignment.Start)
        }
        .width('100%')
        .margin({ top: LociTokens.SPACE_5 })
        .padding({ bottom: LociTokens.SPACE_5 })
        .border({ width: { bottom: 1 }, color: LociTokens.LINE })

        if (this.queue.length === 0) {
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
        .fontSize(12)
        .fontColor(LociTokens.INK_MUTED)
      Blank()
      Text(this.currentConcept()?.label ?? '')
        .fontSize(12)
        .fontColor(LociTokens.INK_MUTED)
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_5 })
  }

  /** 第一步:主动回忆(先遮定义,点击揭示)。 */
  @Builder
  private recallCard() {
    Column() {
      this.cardHeader('主动回忆')

      Text(`先不看资料:用一两句话说出「${this.currentConcept()?.label ?? ''}」在讲什么。`)
        .fontSize(LociTokens.FONT_SECTION)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-0.5)
        .lineHeight(36)
        .width('100%')
        .margin({ top: LociTokens.SPACE_5 })

      TextArea({ placeholder: '用一两句话回答…', text: this.recallAnswer })
        .width('100%')
        .constraintSize({ minHeight: 96, maxHeight: 160 })
        .fontSize(14)
        .fontColor(LociTokens.INK)
        .placeholderColor(LociTokens.INK_MUTED)
        .placeholderFont({ size: 14 })
        .caretColor(LociTokens.ACCENT)
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
          .fontSize(11)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text(this.revealed ? (this.currentConcept()?.definition ?? '') : '点击揭示,对照自己的回答')
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

      this.cardFooter({ enabled: this.recallAnswer.trim().length > 0 || this.revealed, actionLabel: '提交回答',
        action: (): void => this.submitRecall() } as ReviewFooterParam)
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
                .stroke(this.selectedOptionId === option.id ? LociTokens.ACCENT : LociTokens.LINE_STRONG)
                .strokeWidth(1.4)
              if (this.selectedOptionId === option.id) {
                Circle().width(6).height(6).fill(LociTokens.ACCENT)
              }
            }
            .width(14)
            .height(14)
            Text(option.label)
              .fontSize(14)
              .fontColor(this.selectedOptionId === option.id ? LociTokens.INK : LociTokens.INK_SOFT)
              .lineHeight(21)
              .layoutWeight(1)
          }
          .width('100%')
          .padding(LociTokens.SPACE_4)
          .borderRadius(LociTokens.RADIUS_BLOCK)
          .border({
            width: 1,
            color: this.selectedOptionId === option.id ? LociTokens.ACCENT : LociTokens.LINE
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

      this.cardFooter({ enabled: this.selectedOptionId.length > 0, actionLabel: '提交判断',
        action: (): void => this.submitQuiz() } as ReviewFooterParam)
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** 第三步:结果反馈(含来源回跳)。 */
  @Builder
  private feedbackCard() {
    Column() {
      this.cardHeader('结果与来源')

      Row({ space: LociTokens.SPACE_3 }) {
        Text(this.lastCorrect ? '✓' : '⚠')
          .fontSize(18)
          .fontColor(this.lastCorrect ? LociTokens.SUCCESS : LociTokens.WARNING)
        Column({ space: 6 }) {
          Text(this.lastCorrect ? '已保存回答 · 与资料一致' : '已保存回答 · 还需巩固')
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
            .width('100%')
          Text(this.currentQuiz()?.explanation ?? '')
            .fontSize(13)
            .fontColor(LociTokens.INK_SOFT)
            .lineHeight(21)
            .width('100%')
          Row({ space: 5 }) {
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
            Text('查看来源与相关正文')
              .fontSize(12)
              .fontColor(LociTokens.ACCENT)
          }
          .height(LociTokens.CONTROL_MIN)
          .margin({ top: LociTokens.SPACE_2 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            const concept: LociConcept | undefined = this.currentConcept()
            const anchorId: string | undefined =
              concept !== undefined ? this.conceptAnchorId(concept) : undefined
            if (anchorId !== undefined) {
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
          .fontSize(13)
          .fontColor(LociTokens.INK_MUTED)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.defer())
        Blank()
        Text(this.index === this.queue.length - 1 ? '查看结果' : '下一项')
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.ACCENT_INK)
          .textAlign(TextAlign.Center)
          .height(LociTokens.CONTROL_MIN)
          .padding({ left: 22, right: 22 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(LociTokens.ACCENT)
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

  /** 卡片底栏:稍后处理(左)+ 主按钮(右)。V2 注意:基本类型 @Builder 参数不响应式,用对象字面量。 */
  @Builder
  private cardFooter(param: ReviewFooterParam) {
    Row() {
      Text('稍后处理')
        .fontSize(13)
        .fontColor(LociTokens.INK_MUTED)
        .height(LociTokens.CONTROL_MIN)
        .padding({ left: LociTokens.SPACE_2, right: LociTokens.SPACE_2 })
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.defer())
      Blank()
      Text(param.actionLabel)
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor(param.enabled ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
        .textAlign(TextAlign.Center)
        .height(LociTokens.CONTROL_MIN)
        .padding({ left: 22, right: 22 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .backgroundColor(param.enabled ? LociTokens.ACCENT : LociTokens.SURFACE)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => {
          if (param.enabled) {
            param.action()
          }
        })
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_5 })
    .padding({ bottom: LociTokens.SPACE_6 })
  }

  /** 结果页:已巩固 / 仍需复习分组(不包装成分数,docs/03 §11)。 */
  @Builder
  private resultView() {
    Scroll() {
      Column({ space: LociTokens.SPACE_4 }) {
        Text('✓')
          .fontSize(28)
          .fontColor(LociTokens.SUCCESS)
          .width('100%')
          .margin({ top: LociTokens.SPACE_6 })
        Text(`已保存 ${this.queue.length} 条复习事件(Mock)`)
          .fontSize(11)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text('先回到学习书继续')
          .fontSize(LociTokens.FONT_SECTION)
          .fontWeight(FontWeight.Lighter)
          .fontColor(LociTokens.INK)
          .width('100%')
        Text('这次回答会形成新的学习证据。概念状态由全部有效证据重新投影,不会因为一次回答就永久标记掌握。')
          .fontSize(13)
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
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.ACCENT_INK)
          Text('→')
            .fontSize(14)
            .fontColor(LociTokens.ACCENT_INK)
        }
        .justifyContent(FlexAlign.Center)
        .width('100%')
        .height(LociTokens.CONTROL_HEIGHT)
        .margin({ top: LociTokens.SPACE_3, bottom: LociTokens.SPACE_6 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .backgroundColor(LociTokens.ACCENT)
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
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text(labels)
        .fontSize(14)
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
      Text('这次没有待复习概念')
        .fontSize(LociTokens.FONT_TITLE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .width('100%')
        .margin({ top: LociTokens.SPACE_7 })
      Text('概念在小测或讲述中暴露薄弱点后会进入复习队列。')
        .fontSize(13)
        .fontColor(LociTokens.INK_MUTED)
        .lineHeight(20)
        .width('100%')
      Text(this.returnLabel)
        .fontSize(13)
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
