/**
 * 概念图模式 ConceptGraph(M3)
 * 真源:prototype/src/components/workspace/ConceptGraph.tsx;docs/product/03 §8;
 * 视觉基准:HelpCC/harmony-migration/baseline/07-concept-graph.png。
 * 语义:节点=概念(状态色点:已掌握/学习中/待复习/未验证,状态是独立投影不改变结构);
 * 关系=Canvas 直线 + 中点类型标签(依赖/组成/导致/对比/应用/扩展)。
 * 布局与原型一致:固定相对坐标(7 个槽位取模),不做力导向。
 * 手机端(docs/03 §8.5):默认当前章节范围,提供等价列表替代视图;
 * 点击节点出详情面板(定义/直接关系/学习证据/回到正文/询问 Agent/查看来源)。
 */
import { LociTokens } from '../../theme/LociTokens'
import {
  LociConcept,
  LociConceptRelation,
  LociEvidence,
  LociProjectSummary,
  LOCI_EMPTY_PROJECT,
  conceptStateLabel,
  relationTypeLabel
} from '../../models/LociFixtures'

interface GraphPosition {
  x: number
  y: number
}

/** 固定相对坐标(百分比),真源:ConceptGraph.tsx positions,逐值一致。 */
const POSITIONS: GraphPosition[] = [
  { x: 18, y: 24 }, { x: 48, y: 14 }, { x: 76, y: 31 }, { x: 34, y: 53 },
  { x: 68, y: 62 }, { x: 18, y: 78 }, { x: 86, y: 82 }
]

const STAGE_HEIGHT: number = 420

function conceptStateColor(state: string): string {
  switch (state) {
    case 'mastered': return LociTokens.SUCCESS
    case 'learning': return LociTokens.ACCENT
    case 'review': return LociTokens.WARNING
    default: return LociTokens.INK_MUTED
  }
}

@ComponentV2
export struct ConceptGraph {
  @Param project: LociProjectSummary = LOCI_EMPTY_PROJECT
  @Param chapterId: string = ''
  @Event onBackToContent: () => void = (): void => {}
  @Event onAskAgent: (concept: LociConcept) => void = (concept: LociConcept): void => {}
  @Event onOpenSource: (anchorId: string) => void = (anchorId: string): void => {}

  @Local private scope: string = 'chapter' // 'chapter' | 'book'
  @Local private view: string = 'graph'    // 'graph' | 'list'
  @Local private selectedId: string = ''

  private lineContext: CanvasRenderingContext2D =
    new CanvasRenderingContext2D(new RenderingContextSettings(true))
  private stageWidthVp: number = 0
  private stageHeightVp: number = 0

  private concepts(): LociConcept[] {
    const all: LociConcept[] = this.project.concepts ?? []
    if (this.scope === 'book') {
      return all
    }
    return all.filter((concept: LociConcept): boolean => concept.chapterIds.includes(this.chapterId))
  }

  private relations(): LociConceptRelation[] {
    const visibleIds: string[] = this.concepts().map((concept: LociConcept): string => concept.id)
    return (this.project.relations ?? []).filter((relation: LociConceptRelation): boolean =>
      visibleIds.includes(relation.from) && visibleIds.includes(relation.to))
  }

  private selectedConcept(): LociConcept | undefined {
    return (this.project.concepts ?? []).find((concept: LociConcept): boolean =>
      concept.id === this.selectedId)
  }

  private positionOf(conceptId: string): GraphPosition {
    const index: number = this.concepts().findIndex((concept: LociConcept): boolean =>
      concept.id === conceptId)
    return POSITIONS[(index < 0 ? 0 : index) % POSITIONS.length]
  }

  /** 关系线重绘:Canvas 坐标为 px,舞台尺寸按 vp 记录后换算。 */
  private drawLines(): void {
    if (this.stageWidthVp <= 0 || this.stageHeightVp <= 0) {
      return
    }
    const scale: number = this.getUIContext().vp2px(1)
    const widthPx: number = this.stageWidthVp * scale
    const heightPx: number = this.stageHeightVp * scale
    this.lineContext.clearRect(0, 0, widthPx, heightPx)
    this.lineContext.strokeStyle = LociTokens.LINE_STRONG
    this.lineContext.lineWidth = scale
    this.relations().forEach((relation: LociConceptRelation): void => {
      const from: GraphPosition = this.positionOf(relation.from)
      const to: GraphPosition = this.positionOf(relation.to)
      this.lineContext.beginPath()
      this.lineContext.moveTo(from.x / 100 * widthPx, from.y / 100 * heightPx)
      this.lineContext.lineTo(to.x / 100 * widthPx, to.y / 100 * heightPx)
      this.lineContext.stroke()
    })
  }

  private setScope(scope: string): void {
    this.scope = scope
    this.selectedId = ''
    this.drawLines()
  }

  build() {
    Column() {
      // ---- 头:标题 + 范围/视图切换 ----
      Text('知识结构与学习状态')
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text('概念图')
        .fontSize(LociTokens.FONT_PAGE)
        .fontWeight(FontWeight.Lighter)
        .fontColor(LociTokens.INK)
        .letterSpacing(-1.5)
        .width('100%')
        .margin({ top: 4 })
      Text('关系描述知识本身，节点状态来自正式学习证据，两者互不覆盖。')
        .fontSize(12)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(19)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })

      Row() {
        Row({ space: LociTokens.SPACE_5 }) {
          this.scopeTab('chapter', '当前章节')
          this.scopeTab('book', '整本学习书')
        }
        Blank()
        Row({ space: LociTokens.SPACE_3 }) {
          this.viewTab('graph', '图形')
          this.viewTab('list', '列表')
        }
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })

      // ---- 图 / 列表 ----
      if (this.concepts().length === 0) {
        Column({ space: LociTokens.SPACE_3 }) {
          Text('当前范围还没有概念')
            .fontSize(LociTokens.FONT_TITLE)
            .fontColor(LociTokens.INK)
            .width('100%')
          Text(this.scope === 'chapter' ?
            '这一章的概念还没有生成。可以切换到整本学习书，或先阅读已有章节。' :
            '这本学习书的概念图还没有生成。生成完成后，知识结构会显示在这里。')
            .fontSize(12)
            .fontColor(LociTokens.INK_SOFT)
            .lineHeight(19)
            .width('100%')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding({ top: LociTokens.SPACE_7, bottom: LociTokens.SPACE_7 })
      } else if (this.view === 'graph') {
        this.graphStage()
      } else {
        this.conceptList()
      }

      // ---- 节点详情面板 ----
      if (this.selectedConcept() !== undefined) {
        this.conceptDetail(this.selectedConcept() as LociConcept)
      }

      // ---- 图例 ----
      Row({ space: LociTokens.SPACE_4 }) {
        this.legendItem('mastered')
        this.legendItem('learning')
        this.legendItem('review')
        this.legendItem('unverified')
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
      Text('关系线均有明确类型与资料依据')
        .fontSize(10)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
        .margin({ top: LociTokens.SPACE_2 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_4, bottom: LociTokens.SPACE_7 })
  }

  @Builder
  private scopeTab(id: string, label: string) {
    Column({ space: 6 }) {
      Text(label)
        .fontSize(13)
        .fontWeight(this.scope === id ? FontWeight.Medium : FontWeight.Normal)
        .fontColor(this.scope === id ? LociTokens.INK : LociTokens.INK_MUTED)
      Rect()
        .width('100%')
        .height(1)
        .fill(this.scope === id ? LociTokens.INK : Color.Transparent)
    }
    .height(LociTokens.CONTROL_MIN)
    .justifyContent(FlexAlign.Center)
    .accessibilityRole(AccessibilityRoleType.BUTTON)
    .accessibilityDescription(`概念图范围:${label}`)
    .onClick((): void => this.setScope(id))
  }

  @Builder
  private viewTab(id: string, label: string) {
    Text(label)
      .fontSize(12)
      .fontColor(this.view === id ? LociTokens.INK : LociTokens.INK_MUTED)
      .textAlign(TextAlign.Center)
      .height(LociTokens.CONTROL_MIN)
      .padding({ left: 12, right: 12 })
      .borderRadius(LociTokens.RADIUS_CONTROL)
      .border({ width: 1, color: this.view === id ? LociTokens.LINE_STRONG : LociTokens.LINE })
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .accessibilityDescription(`概念图视图:${label}`)
      .onClick((): void => {
        this.view = id
      })
  }

  @Builder
  private graphStage() {
    Stack({ alignContent: Alignment.TopStart }) {
      // 关系线层
      Canvas(this.lineContext)
        .width('100%')
        .height('100%')
        .onAreaChange((_: Area, newArea: Area): void => {
          this.stageWidthVp = Number(newArea.width)
          this.stageHeightVp = Number(newArea.height)
          this.drawLines()
        })

      // 关系类型标签(线中点)
      ForEach(this.relations(), (relation: LociConceptRelation) => {
        Text(relationTypeLabel(relation.type))
          .fontSize(10)
          .fontColor(LociTokens.INK_MUTED)
          .padding({ left: 4, right: 4 })
          .backgroundColor(LociTokens.SCREEN)
          .position({
            x: `${(this.positionOf(relation.from).x + this.positionOf(relation.to).x) / 2}%`,
            y: `${(this.positionOf(relation.from).y + this.positionOf(relation.to).y) / 2}%`
          })
          .translate({ x: '-50%', y: '-50%' })
      }, (relation: LociConceptRelation): string => relation.id)

      // 概念节点(固定相对坐标)
      ForEach(this.concepts(), (concept: LociConcept, index: number) => {
        Column({ space: 4 }) {
          Circle()
            .width(10)
            .height(10)
            .fill(conceptStateColor(concept.state))
            .stroke(this.selectedId === concept.id ? LociTokens.INK : Color.Transparent)
            .strokeWidth(1.5)
          Text(concept.label)
            .fontSize(12)
            .fontWeight(this.selectedId === concept.id ? FontWeight.Medium : FontWeight.Normal)
            .fontColor(LociTokens.INK)
            .maxLines(2)
            .textAlign(TextAlign.Center)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(conceptStateLabel(concept.state))
            .fontSize(10)
            .fontColor(conceptStateColor(concept.state))
        }
        .alignItems(HorizontalAlign.Center)
        .justifyContent(FlexAlign.Center)
        .width(88)
        .constraintSize({ minHeight: LociTokens.CONTROL_MIN })
        .padding(LociTokens.SPACE_1)
        .position({ x: `${POSITIONS[index % POSITIONS.length].x}%`, y: `${POSITIONS[index % POSITIONS.length].y}%` })
        .translate({ x: '-50%', y: '-50%' })
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .accessibilityDescription(`概念 ${concept.label},${conceptStateLabel(concept.state)}`)
        .onClick((): void => {
          this.selectedId = concept.id
        })
      }, (concept: LociConcept): string => concept.id)
    }
    .width('100%')
    .height(STAGE_HEIGHT)
    .margin({ top: LociTokens.SPACE_4 })
  }

  /** 列表替代视图(docs/03 §8.5:地图必须提供等价列表)。 */
  @Builder
  private conceptList() {
    Column() {
      ForEach(this.concepts(), (concept: LociConcept) => {
        Row({ space: LociTokens.SPACE_3 }) {
          Row({ space: 5 }) {
            Circle().width(6).height(6).fill(conceptStateColor(concept.state))
            Text(conceptStateLabel(concept.state))
              .fontSize(10)
              .fontColor(conceptStateColor(concept.state))
          }
          .width(64)

          Column({ space: 4 }) {
            Text(concept.label)
              .fontSize(13)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTokens.INK)
              .width('100%')
            Text(concept.definition)
              .fontSize(11)
              .fontColor(LociTokens.INK_MUTED)
              .lineHeight(17)
              .maxLines(2)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .width('100%')
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)

          Text('›')
            .fontSize(18)
            .fontColor(LociTokens.INK_MUTED)
        }
        .width('100%')
        .constraintSize({ minHeight: LociTokens.CONTROL_MIN })
        .padding({ top: 14, bottom: 14 })
        .border({ width: { bottom: 1 }, color: LociTokens.LINE })
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => {
          this.selectedId = concept.id
        })
      }, (concept: LociConcept): string => concept.id)
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_2 })
  }

  @Builder
  private conceptDetail(concept: LociConcept) {
    Column() {
      Row() {
        Row({ space: 5 }) {
          Circle().width(6).height(6).fill(conceptStateColor(concept.state))
          Text(conceptStateLabel(concept.state))
            .fontSize(11)
            .fontColor(conceptStateColor(concept.state))
        }
        Blank()
        Text('×')
          .fontSize(20)
          .fontColor(LociTokens.INK)
          .textAlign(TextAlign.Center)
          .width(LociTokens.CONTROL_MIN)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityText('关闭概念详情')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            this.selectedId = ''
          })
      }
      .width('100%')

      Text(concept.label)
        .fontSize(LociTokens.FONT_TITLE)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
        .width('100%')
      Text(concept.definition)
        .fontSize(13)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(21)
        .width('100%')
        .margin({ top: LociTokens.SPACE_2 })

      // 直接关系
      Text('直接关系')
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
        .margin({ top: LociTokens.SPACE_5 })
      Column({ space: LociTokens.SPACE_3 }) {
        ForEach(this.directRelations(concept.id), (relation: LociConceptRelation) => {
          Column({ space: 3 }) {
            Row({ space: 6 }) {
              Text(relationTypeLabel(relation.type))
                .fontSize(12)
                .fontWeight(FontWeight.Medium)
                .fontColor(LociTokens.ACCENT)
              Text(this.otherConceptLabel(concept.id, relation))
                .fontSize(12)
                .fontColor(LociTokens.INK)
            }
            .width('100%')
            Text(relation.reason)
              .fontSize(11)
              .fontColor(LociTokens.INK_MUTED)
              .lineHeight(17)
              .width('100%')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
        }, (relation: LociConceptRelation): string => relation.id)
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_3 })

      // 学习证据
      Text('学习证据')
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
        .margin({ top: LociTokens.SPACE_5 })
      Text(this.evidenceSummary(concept.id))
        .fontSize(12)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(19)
        .width('100%')
        .margin({ top: LociTokens.SPACE_2 })

      // 出口:回到正文 / 询问 Agent / 查看来源
      Row({ space: LociTokens.SPACE_5 }) {
        Text('回到正文')
          .fontSize(13)
          .fontColor(LociTokens.INK)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onBackToContent())
        Row({ space: 4 }) {
          Text('✦')
            .fontSize(12)
            .fontColor(LociTokens.AGENT)
          Text('询问 Agent')
            .fontSize(13)
            .fontColor(LociTokens.AGENT)
        }
        .height(LociTokens.CONTROL_MIN)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onAskAgent(concept))
        Text('查看来源')
          .fontSize(13)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            const first: string | undefined = concept.sourceIds[0]
            if (first !== undefined) {
              this.onOpenSource(first)
            }
          })
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(LociTokens.SPACE_4)
    .borderRadius(LociTokens.RADIUS_BLOCK)
    .backgroundColor(LociTokens.SURFACE)
    .margin({ top: LociTokens.SPACE_4 })
  }

  private directRelations(conceptId: string): LociConceptRelation[] {
    return (this.project.relations ?? []).filter((relation: LociConceptRelation): boolean =>
      relation.from === conceptId || relation.to === conceptId)
  }

  private otherConceptLabel(conceptId: string, relation: LociConceptRelation): string {
    const otherId: string = relation.from === conceptId ? relation.to : relation.from
    const other: LociConcept | undefined = (this.project.concepts ?? []).find(
      (concept: LociConcept): boolean => concept.id === otherId)
    return other?.label ?? otherId
  }

  private evidenceSummary(conceptId: string): string {
    const found: LociEvidence | undefined = (this.project.evidence ?? []).find(
      (item: LociEvidence): boolean => item.conceptId === conceptId)
    return found?.summary ?? '还没有正式学习证据，当前状态是未验证。'
  }

  @Builder
  private legendItem(state: string) {
    Row({ space: 5 }) {
      Circle().width(6).height(6).fill(conceptStateColor(state))
      Text(conceptStateLabel(state))
        .fontSize(10)
        .fontColor(LociTokens.INK_MUTED)
    }
    .height(LociTokens.CONTROL_MIN)
  }
}
