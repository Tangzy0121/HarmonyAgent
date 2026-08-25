/**
 * 全书总结 SummaryPage(M4)
 * 真源:prototype/src/pages/SummaryPage.tsx;docs/product/03 §11。
 * 内容:完成章节清单、代表性学习证据(前 3 条,可回跳来源)、
 * 当前投影(已掌握)/ 后续方向(仍待复习,可发起短复习)、
 * 继续方向(返回今日 / 开始新项目)。
 * 纪律:不是成绩单——无奖章、积分和夸张庆祝(docs/03 §11)。
 * 入口:学习库 completed 项目点击(AppRoot 路由)。
 */
import { LociTokens } from '../theme/LociTokens'
import {
  LociChapter,
  LociConcept,
  LociEvidence,
  LociProjectSummary,
  LociSourceAnchor,
  LOCI_EMPTY_PROJECT,
  conceptStateLabel
} from '../models/LociFixtures'
import { LociImmersiveHeader } from '../components/create/LociImmersiveHeader'
import { SourceViewer } from '../components/overlays/SourceViewer'

function stateColor(state: string): string {
  switch (state) {
    case 'mastered': return LociTokens.SUCCESS
    case 'review': return LociTokens.WARNING
    case 'learning': return LociTokens.ACCENT
    default: return LociTokens.INK_MUTED
  }
}

/** 证据类型文案,真源:prototype SummaryPage 内联三元(逐字一致)。 */
function evidenceKindLabel(kind: string): string {
  if (kind === 'quiz') {
    return '小测'
  }
  if (kind === 'feynman') {
    return '费曼讲述'
  }
  return '复习'
}

@ComponentV2
export struct SummaryPage {
  @Param project: LociProjectSummary = LOCI_EMPTY_PROJECT
  @Event onBack: () => void = (): void => {}
  @Event onOpenReview: (project: LociProjectSummary) => void =
    (project: LociProjectSummary): void => {}
  @Event onCreate: () => void = (): void => {}
  @Event onGoToday: () => void = (): void => {}

  @Local private sourceAnchorId: string = ''

  private masteredConcepts(): LociConcept[] {
    return (this.project.concepts ?? []).filter((concept: LociConcept): boolean =>
      concept.state === 'mastered')
  }

  private reviewConcepts(): LociConcept[] {
    return (this.project.concepts ?? []).filter((concept: LociConcept): boolean =>
      concept.state === 'review')
  }

  private topEvidence(): LociEvidence[] {
    return (this.project.evidence ?? []).slice(0, 3)
  }

  private activeAnchor(): LociSourceAnchor | undefined {
    return (this.project.anchors ?? []).find((anchor: LociSourceAnchor): boolean =>
      anchor.id === this.sourceAnchorId)
  }

  private openEvidenceSource(item: LociEvidence): void {
    const first: string | undefined = item.sourceIds[0]
    const found: LociSourceAnchor | undefined = (this.project.anchors ?? []).find(
      (anchor: LociSourceAnchor): boolean => anchor.id === first)
    if (found !== undefined) {
      this.sourceAnchorId = found.id
    }
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() {
        LociImmersiveHeader({
          title: '全书总结',
          meta: this.project.source.name,
          backLabel: '',
          onBack: (): void => this.onBack()
        })

        Scroll() {
          Column() {
            this.hero()
            this.chapterSection()
            this.evidenceSection()
            this.projectionSection()
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

      // 证据层:来源查看器(代表性证据回跳)
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

  /** 头部:完成标记 + 继续方向(返回今日 / 开始新项目)。 */
  @Builder
  private hero() {
    Column() {
      Text('✓')
        .fontSize(23)
        .fontColor(LociTokens.SUCCESS)
        .width('100%')
        .margin({ top: LociTokens.SPACE_6 })
      Text('计划范围已经完成')
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })
      Text(this.project.title)
        .fontSize(LociTokens.FONT_PAGE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-1.5)
        .lineHeight(46)
        .width('100%')
        .margin({ top: LociTokens.SPACE_2 })
      Text('你完成了计划中的章节与验证。这里回顾代表性证据和仍值得复查的方向,不把结果包装成分数。')
        .fontSize(13)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(21)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })

      Row({ space: LociTokens.SPACE_3 }) {
        Row({ space: 6 }) {
          Text('返回今日')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.ACCENT_INK)
          Text('→')
            .fontSize(13)
            .fontColor(LociTokens.ACCENT_INK)
        }
        .justifyContent(FlexAlign.Center)
        .height(LociTokens.CONTROL_HEIGHT)
        .padding({ left: 22, right: 22 })
        .borderRadius(LociTokens.RADIUS_CONTROL)
        .backgroundColor(LociTokens.ACCENT)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onGoToday())

        Text('开始新项目')
          .fontSize(13)
          .fontColor(LociTokens.INK)
          .textAlign(TextAlign.Center)
          .height(LociTokens.CONTROL_HEIGHT)
          .padding({ left: 22, right: 22 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .border({ width: 1, color: LociTokens.LINE_STRONG })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onCreate())
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ bottom: LociTokens.SPACE_6 })
  }

  /** 完成的范围:章节清单。 */
  @Builder
  private chapterSection() {
    Column() {
      this.sectionHeader('完成的范围', `${this.project.chapters.length} 个章节`)
      Column() {
        ForEach(this.project.chapters, (chapter: LociChapter) => {
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
            }
            .layoutWeight(1)
            .alignItems(HorizontalAlign.Start)
            Text('✓')
              .fontSize(15)
              .fontColor(LociTokens.SUCCESS)
          }
          .width('100%')
          .padding({ top: LociTokens.SPACE_3, bottom: LociTokens.SPACE_3 })
          .border({ width: { bottom: 1 }, color: LociTokens.LINE })
        }, (chapter: LociChapter): string => chapter.id)
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_3 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_5, bottom: LociTokens.SPACE_5 })
    .border({ width: { top: 1 }, color: LociTokens.LINE_STRONG })
  }

  /** 代表性学习证据:前 3 条,可回跳事件与来源。 */
  @Builder
  private evidenceSection() {
    Column() {
      this.sectionHeader('代表性学习证据', '你的判断依据')
      if (this.topEvidence().length === 0) {
        Text('这个项目还没有保存学习证据。')
          .fontSize(12)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
          .margin({ top: LociTokens.SPACE_3 })
      } else {
        Column({ space: LociTokens.SPACE_3 }) {
          ForEach(this.topEvidence(), (item: LociEvidence) => {
            Row({ space: LociTokens.SPACE_3 }) {
              Text(item.result === 'supports' ? '✓' : '⚠')
                .fontSize(15)
                .fontColor(item.result === 'supports' ? LociTokens.SUCCESS : LociTokens.WARNING)
              Column({ space: 4 }) {
                Text(`${evidenceKindLabel(item.kind)} · ${item.occurredAt}`)
                  .fontSize(10)
                  .fontColor(LociTokens.INK_MUTED)
                  .width('100%')
                Text(item.summary)
                  .fontSize(13)
                  .fontColor(LociTokens.INK)
                  .lineHeight(20)
                  .width('100%')
                Text('回到事件与来源')
                  .fontSize(11)
                  .fontColor(LociTokens.ACCENT)
                  .height(LociTokens.CONTROL_MIN)
                  .accessibilityRole(AccessibilityRoleType.BUTTON)
                  .onClick((): void => this.openEvidenceSource(item))
              }
              .layoutWeight(1)
              .alignItems(HorizontalAlign.Start)
            }
            .width('100%')
            .padding(LociTokens.SPACE_4)
            .borderRadius(LociTokens.RADIUS_BLOCK)
            .backgroundColor(LociTokens.SURFACE)
          }, (item: LociEvidence): string => item.id)
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

  /** 当前投影(已掌握)/ 后续方向(仍待复习 + 发起短复习)。 */
  @Builder
  private projectionSection() {
    Column() {
      Column() {
        this.sectionHeader('当前投影', '有证据支持')
        if (this.masteredConcepts().length === 0) {
          Text('还没有已掌握的概念。')
            .fontSize(12)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
            .margin({ top: LociTokens.SPACE_3 })
        } else {
          Column({ space: LociTokens.SPACE_4 }) {
            ForEach(this.masteredConcepts(), (concept: LociConcept) => {
              this.conceptRow(concept)
            }, (concept: LociConcept): string => concept.id)
          }
          .width('100%')
          .margin({ top: LociTokens.SPACE_3 })
        }
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)

      Column() {
        this.sectionHeader('后续方向', '仍值得复查')
        if (this.reviewConcepts().length === 0) {
          Text('没有待复习的概念。')
            .fontSize(12)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
            .margin({ top: LociTokens.SPACE_3 })
        } else {
          Column({ space: LociTokens.SPACE_4 }) {
            ForEach(this.reviewConcepts(), (concept: LociConcept) => {
              this.conceptRow(concept)
            }, (concept: LociConcept): string => concept.id)
          }
          .width('100%')
          .margin({ top: LociTokens.SPACE_3 })

          Row({ space: 5 }) {
            Text('开始一次短复习')
              .fontSize(13)
              .fontColor(LociTokens.ACCENT)
            Text('→')
              .fontSize(14)
              .fontColor(LociTokens.ACCENT)
          }
          .height(LociTokens.CONTROL_MIN)
          .margin({ top: LociTokens.SPACE_3 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onOpenReview(this.project))
        }
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .margin({ top: LociTokens.SPACE_6 })
      .padding({ bottom: LociTokens.SPACE_7 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_5 })
    .border({ width: { top: 1 }, color: LociTokens.LINE_STRONG })
  }

  @Builder
  private sectionHeader(eyebrow: string, title: string) {
    Column({ space: 6 }) {
      Text(eyebrow)
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text(title)
        .fontSize(LociTokens.FONT_TITLE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .width('100%')
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** 概念行:状态徽标 + 名称 + 定义(真源:prototype StatusBadge + concept-summary-list)。 */
  @Builder
  private conceptRow(concept: LociConcept) {
    Column({ space: 5 }) {
      Row({ space: LociTokens.SPACE_2 }) {
        Text(conceptStateLabel(concept.state))
          .fontSize(10)
          .fontColor(stateColor(concept.state))
          .padding({ left: 10, right: 10, top: 3, bottom: 3 })
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .border({ width: 1, color: stateColor(concept.state) })
        Text(concept.label)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
      }
      Text(concept.definition)
        .fontSize(12)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(19)
        .width('100%')
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }
}
