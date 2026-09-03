/**
 * 章末总结 ChapterSummary(M3;M4 接复习页)
 * 真源:prototype/src/components/workspace/ChapterSummary.tsx;docs/product/03 §7.6。
 * 内容:本章证据条(quiz/feynman/review 事件 + 来源入口)、待复习概念 chips、
 * 三个出口:继续下一章(next ready 才显示)/ 复习薄弱概念(M4 ReviewPage)/ 询问 Agent。
 * M4:待复习 chips 与「复习薄弱概念」通过 onOpenReview 进复习页。
 * M5e:Chat 建议动作 mock 已删(turns 协议无「直接创建复习」action,改走 user_question
 * 流程);extraReviewConceptIds 暂无生产方,保留参数,WorkspacePage 恒传 []。
 */
import { LociTokens } from '../../theme/LociTokens'
import {
  LociChapter,
  LociConcept,
  LociEvidence,
  LociProjectSummary,
  LOCI_EMPTY_PROJECT
} from '../../models/LociModels'

@ComponentV2
export struct ChapterSummary {
  @Param project: LociProjectSummary = LOCI_EMPTY_PROJECT
  @Param chapter: LociChapter = { id: '', order: 0, title: '', estimatedMinutes: 0, taskState: '', read: false } as LociChapter
  /** 扩展复习概念 id 槽位(M5e 起暂无生产方,恒为 [])。 */
  @Param extraReviewConceptIds: string[] = []
  @Event onSelectChapter: (chapterId: string) => void = (chapterId: string): void => {}
  @Event onAskAgent: () => void = (): void => {}
  @Event onOpenSource: (anchorId: string) => void = (anchorId: string): void => {}
  @Event onOpenReview: () => void = (): void => {}

  private chapterEvidence(): LociEvidence[] {
    return (this.project.evidence ?? []).filter((item: LociEvidence): boolean =>
      item.chapterId === this.chapter.id)
  }

  private reviewConcepts(): LociConcept[] {
    const reviewIds: string[] = (this.project.reviewConceptIds ?? []).concat(this.extraReviewConceptIds)
    return (this.project.concepts ?? []).filter((concept: LociConcept): boolean =>
      reviewIds.includes(concept.id) && concept.chapterIds.includes(this.chapter.id))
  }

  private nextChapter(): LociChapter | undefined {
    return this.project.chapters.find((entry: LociChapter): boolean =>
      entry.order === this.chapter.order + 1)
  }

  build() {
    Column() {
      Text('章末总结')
        .fontSize(LociTokens.FONT_CAPTION)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text('这一章留下了什么')
        .fontSize(LociTokens.FONT_SECTION)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .width('100%')
        .margin({ top: 6 })

      // ---- 证据条 ----
      Column({ space: LociTokens.SPACE_3 }) {
        if (this.chapterEvidence().length === 0) {
          Text('完成本章小测或费曼讲述后，正式证据会出现在这里。')
            .fontSize(LociTokens.FONT_LABEL)
            .fontColor(LociTokens.INK_MUTED)
            .lineHeight(19)
            .width('100%')
        } else {
          ForEach(this.chapterEvidence(), (item: LociEvidence) => {
            Row({ space: LociTokens.SPACE_3 }) {
              Text(item.result === 'supports' ? '✓' : '⚠')
                .fontSize(LociTokens.FONT_BODY)
                .fontColor(item.result === 'supports' ? LociTokens.SUCCESS : LociTokens.WARNING)
              Column({ space: 4 }) {
                Text(`${item.sourceEventLabel} · ${item.occurredAt}`)
                  .fontSize(LociTokens.FONT_MICRO)
                  .fontColor(LociTokens.INK_MUTED)
                  .width('100%')
                Text(item.summary)
                  .fontSize(LociTokens.FONT_META)
                  .fontColor(LociTokens.INK)
                  .lineHeight(20)
                  .width('100%')
                Text('查看事件与来源')
                  .fontSize(LociTokens.FONT_CAPTION)
                  .fontColor(LociTokens.ACCENT)
                  .height(LociTokens.CONTROL_MIN)
                  .accessibilityRole(AccessibilityRoleType.BUTTON)
                  .onClick((): void => {
                    const first: string | undefined = item.sourceIds[0]
                    if (first !== undefined) {
                      this.onOpenSource(first)
                    }
                  })
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
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })

      // ---- 待复习概念 ----
      if (this.reviewConcepts().length > 0) {
        Flex({ wrap: FlexWrap.Wrap }) {
          Text('待复习')
            .fontSize(LociTokens.FONT_CAPTION)
            .fontColor(LociTokens.INK_MUTED)
            .margin({ right: LociTokens.SPACE_3, top: 12 })
          ForEach(this.reviewConcepts(), (concept: LociConcept) => {
            Row({ space: 4 }) {
              Text(concept.label)
                .fontSize(LociTokens.FONT_LABEL)
                .fontColor(LociTokens.WARNING)
              Text('→')
                .fontSize(LociTokens.FONT_LABEL)
                .fontColor(LociTokens.WARNING)
            }
            .height(LociTokens.CONTROL_MIN)
            .padding({ left: 14, right: 14 })
            .margin({ right: LociTokens.SPACE_2, top: LociTokens.SPACE_2 })
            .borderRadius(LociTokens.RADIUS_CONTROL)
            .border({ width: 1, color: LociTokens.WARNING })
            .accessibilityRole(AccessibilityRoleType.BUTTON)
            .accessibilityDescription(`复习概念 ${concept.label}`)
            .onClick((): void => this.onOpenReview())
          }, (concept: LociConcept): string => concept.id)
        }
        .width('100%')
        .margin({ top: LociTokens.SPACE_4 })
      }

      // ---- 三个出口 ----
      Column({ space: LociTokens.SPACE_3 }) {
        // M7a:下一章 pending/failed 时也给出入口(此前仅 ready 可进,加上抽屉禁用 pending,
        // 导致 server 书首章读完后再无路径触发生成——UX 断链修复)
        if (this.nextChapter() !== undefined && this.nextChapter()?.taskState !== 'running') {
          Row({ space: 6 }) {
            Text(this.nextChapter()?.taskState === 'ready' ? '继续下一章' : '生成下一章')
              .fontSize(LociTokens.FONT_SMALL)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTokens.ACCENT_INK)
            Text('→')
              .fontSize(LociTokens.FONT_SMALL)
              .fontColor(LociTokens.ACCENT_INK)
          }
          .justifyContent(FlexAlign.Center)
          .width('100%')
          .height(LociTokens.CONTROL_HEIGHT)
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(LociTokens.ACCENT)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            const next: LociChapter | undefined = this.nextChapter()
            if (next !== undefined) {
              this.onSelectChapter(next.id)
            }
          })
        }
        if (this.reviewConcepts().length > 0) {
          Text('复习薄弱概念')
            .fontSize(LociTokens.FONT_META)
            .fontColor(LociTokens.INK)
            .textAlign(TextAlign.Center)
            .width('100%')
            .height(LociTokens.CONTROL_HEIGHT)
            .borderRadius(LociTokens.RADIUS_CONTROL)
            .border({ width: 1, color: LociTokens.LINE_STRONG })
            .accessibilityRole(AccessibilityRoleType.BUTTON)
            .onClick((): void => this.onOpenReview())
        }
        Row({ space: 6 }) {
          Text('✦')
            .fontSize(LociTokens.FONT_META)
            .fontColor(LociTokens.AGENT)
          Text('询问 Agent')
            .fontSize(LociTokens.FONT_META)
            .fontColor(LociTokens.AGENT)
        }
        .justifyContent(FlexAlign.Center)
        .width('100%')
        .height(LociTokens.CONTROL_HEIGHT)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onAskAgent())
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_6 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_6, bottom: LociTokens.SPACE_7 })
    .border({ width: { top: 1 }, color: LociTokens.LINE_STRONG })
    .margin({ top: LociTokens.SPACE_4 })
  }
}
