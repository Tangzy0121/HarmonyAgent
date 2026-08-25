/**
 * 六类学习块渲染(M3)
 * 真源:prototype/src/components/workspace/LearningBlocks.tsx;docs/product/03 §7.4/§7.5;
 * 视觉基准:HelpCC/harmony-migration/baseline/05-workspace.png。
 * 块类型:explanation(标题+正文+关键判断+选中操作)/ example(场景+带走)/
 * formula_or_conclusion(公式突出)/ citation(引用,可跳来源)/ quiz(就地判分+解释+重试)/
 * feynman(输入+提交+反馈)。判分逻辑与原型逐字一致(quiz 对错、费曼 40 字阈值)。
 * 块底「资料依据 N」按钮打开来源查看器;「解释/对比/提问」唤起 selection 作用域 Chat。
 */
import { promptAction } from '@kit.ArkUI'
import { LociTokens } from '../../theme/LociTokens'
import { LociLearningBlock, LociQuizOption } from '../../models/LociFixtures'

/** 「资料依据 N」按钮组,真源:LearningBlocks.tsx SourceLinks。 */
@ComponentV2
export struct LociSourceLinks {
  @Param sourceIds: string[] = []
  @Event onOpenSource: (anchorId: string) => void = (anchorId: string): void => {}

  build() {
    Row({ space: LociTokens.SPACE_4 }) {
      ForEach(this.sourceIds, (sourceId: string, index: number) => {
        Row({ space: 5 }) {
          // 来源图标:几何文档形(SDK 缺部分 sys.symbol,用绘制代替)
          Stack() {
            Rect().width(9).height(11).radius(1)
              .fill(Color.Transparent).stroke(LociTokens.INK_MUTED).strokeWidth(1.2)
            Line().width(5).height(1).startPoint([0, 0]).endPoint([5, 0])
              .stroke(LociTokens.INK_MUTED).strokeWidth(1).translate({ y: -1.5 })
            Line().width(5).height(1).startPoint([0, 0]).endPoint([5, 0])
              .stroke(LociTokens.INK_MUTED).strokeWidth(1).translate({ y: 2 })
          }
          .width(9)
          .height(11)

          Text(`资料依据 ${index + 1}`)
            .fontSize(11)
            .fontColor(LociTokens.INK_MUTED)
        }
        .height(LociTokens.CONTROL_MIN)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onOpenSource(sourceId))
      }, (sourceId: string): string => sourceId)
    }
    .width('100%')
    .margin({ top: LociTokens.SPACE_4 })
  }
}

/** 小测块:选项选择 + 提交 + 对错反馈 + 解释 + 重试,真源:LearningBlocks.tsx Quiz。 */
@ComponentV2
export struct QuizBlockView {
  @Param block: LociLearningBlock = { id: '', type: 'quiz', title: '', sourceIds: [] } as LociLearningBlock
  @Event onOpenSource: (anchorId: string) => void = (anchorId: string): void => {}
  @Local private answer: string = ''
  @Local private submitted: boolean = false

  private isCorrect(): boolean {
    return this.submitted && this.answer === this.block.correctOptionId
  }

  build() {
    Column() {
      Text('小测 · 正式学习证据')
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text(this.block.title)
        .fontSize(LociTokens.FONT_TITLE)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
        .width('100%')
        .margin({ top: 6 })
      Text(this.block.question ?? '')
        .fontSize(LociTokens.FONT_BODY)
        .fontColor(LociTokens.INK)
        .lineHeight(24)
        .width('100%')
        .margin({ top: LociTokens.SPACE_4 })

      Column({ space: LociTokens.SPACE_2 }) {
        ForEach(this.block.options ?? [], (option: LociQuizOption, index: number) => {
          Row({ space: LociTokens.SPACE_3 }) {
            Text(String.fromCharCode(65 + index))
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.optionColor(option.id))
            Text(option.label)
              .fontSize(13)
              .fontColor(this.optionColor(option.id))
              .lineHeight(20)
              .layoutWeight(1)
          }
          .width('100%')
          .constraintSize({ minHeight: LociTokens.CONTROL_MIN })
          .padding({ left: 14, right: 14, top: 10, bottom: 10 })
          .borderRadius(LociTokens.RADIUS_BLOCK)
          .border({
            width: 1,
            color: this.submitted && option.id === this.block.correctOptionId ? LociTokens.SUCCESS :
              this.submitted && option.id === this.answer ? LociTokens.DANGER :
                this.answer === option.id ? LociTokens.LINE_STRONG : LociTokens.LINE
          })
          .backgroundColor(this.answer === option.id && !this.submitted ? LociTokens.SURFACE :
            Color.Transparent)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .accessibilityDescription(`选项 ${String.fromCharCode(65 + index)},${option.label}`)
          .onClick((): void => {
            if (!this.submitted) {
              this.answer = option.id
            }
          })
        }, (option: LociQuizOption): string => option.id)
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_4 })

      if (!this.submitted) {
        Text('提交回答')
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.answer.length > 0 ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
          .textAlign(TextAlign.Center)
          .width('100%')
          .height(LociTokens.CONTROL_HEIGHT)
          .borderRadius(LociTokens.RADIUS_CONTROL)
          .backgroundColor(this.answer.length > 0 ? LociTokens.ACCENT : LociTokens.SURFACE)
          .margin({ top: LociTokens.SPACE_4 })
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            if (this.answer.length > 0) {
              this.submitted = true
            }
          })
      } else {
        // 就地反馈:正确性 + 关键解释 + 依据 + 重试(docs/03 §7.5)
        Row({ space: LociTokens.SPACE_3 }) {
          Text(this.isCorrect() ? '✓' : '⚠')
            .fontSize(16)
            .fontColor(this.isCorrect() ? LociTokens.SUCCESS : LociTokens.WARNING)
          Column({ space: 6 }) {
            Text(this.isCorrect() ? '回答正确，已保存一条证据' : '这里还有一个关键混淆')
              .fontSize(13)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTokens.INK)
              .width('100%')
            Text(this.block.explanation ?? '')
              .fontSize(12)
              .fontColor(LociTokens.INK_SOFT)
              .lineHeight(19)
              .width('100%')
            if (!this.isCorrect()) {
              Text('重新作答')
                .fontSize(12)
                .fontColor(LociTokens.ACCENT)
                .height(LociTokens.CONTROL_MIN)
                .accessibilityRole(AccessibilityRoleType.BUTTON)
                .onClick((): void => {
                  this.answer = ''
                  this.submitted = false
                })
            }
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)
        }
        .width('100%')
        .padding(LociTokens.SPACE_4)
        .borderRadius(LociTokens.RADIUS_BLOCK)
        .border({ width: 1, color: this.isCorrect() ? LociTokens.SUCCESS : LociTokens.WARNING })
        .margin({ top: LociTokens.SPACE_4 })

        LociSourceLinks({ sourceIds: this.block.sourceIds, onOpenSource: this.onOpenSource })
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_6, bottom: LociTokens.SPACE_6 })
    .border({ width: { top: 1 }, color: LociTokens.LINE })
  }

  private optionColor(optionId: string): string {
    if (this.submitted && optionId === this.block.correctOptionId) {
      return LociTokens.SUCCESS
    }
    if (this.submitted && optionId === this.answer) {
      return LociTokens.DANGER
    }
    return this.answer === optionId ? LociTokens.INK : LociTokens.INK_SOFT
  }
}

/** 费曼讲述块:输入 + 字数 + 提交 + 覆盖度反馈(40 字阈值),真源:LearningBlocks.tsx Feynman。 */
@ComponentV2
export struct FeynmanBlockView {
  @Param block: LociLearningBlock = { id: '', type: 'feynman', title: '', sourceIds: [] } as LociLearningBlock
  @Event onOpenSource: (anchorId: string) => void = (anchorId: string): void => {}
  @Local private body: string = ''
  @Local private submitted: boolean = false

  private passed(): boolean {
    return this.body.trim().length >= 40
  }

  build() {
    Column() {
      Text('费曼讲述 · 章末验证')
        .fontSize(11)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
      Text(this.block.title)
        .fontSize(LociTokens.FONT_TITLE)
        .fontWeight(FontWeight.Medium)
        .fontColor(LociTokens.INK)
        .width('100%')
        .margin({ top: 6 })
      Text(this.block.prompt ?? '')
        .fontSize(12)
        .fontColor(LociTokens.INK_SOFT)
        .lineHeight(19)
        .width('100%')
        .margin({ top: LociTokens.SPACE_2 })

      if (!this.submitted) {
        TextArea({ placeholder: '合上资料，用自己的话讲给一个不了解这个主题的人…', text: this.body })
          .width('100%')
          .height(140)
          .fontSize(13)
          .fontColor(LociTokens.INK)
          .placeholderColor(LociTokens.INK_MUTED)
          .placeholderFont({ size: 13 })
          .caretColor(LociTokens.ACCENT)
          .backgroundColor(LociTokens.SURFACE)
          .borderRadius(LociTokens.RADIUS_BLOCK)
          .padding(LociTokens.SPACE_4)
          .margin({ top: LociTokens.SPACE_4 })
          .accessibilityText('费曼讲述输入框')
          .onChange((value: string): void => {
            this.body = value
          })
        Row() {
          Text(`${this.body.length} 字`)
            .fontSize(11)
            .fontColor(LociTokens.INK_MUTED)
          Blank()
          Text('提交讲述')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.body.trim().length > 0 ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
            .textAlign(TextAlign.Center)
            .height(LociTokens.CONTROL_HEIGHT)
            .padding({ left: 22, right: 22 })
            .borderRadius(LociTokens.RADIUS_CONTROL)
            .backgroundColor(this.body.trim().length > 0 ? LociTokens.ACCENT : LociTokens.SURFACE)
            .accessibilityRole(AccessibilityRoleType.BUTTON)
            .onClick((): void => {
              if (this.body.trim().length > 0) {
                this.submitted = true
              }
            })
        }
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })
      } else {
        Row({ space: LociTokens.SPACE_3 }) {
          Text(this.passed() ? '✓' : '⚠')
            .fontSize(16)
            .fontColor(this.passed() ? LociTokens.SUCCESS : LociTokens.WARNING)
          Column({ space: 6 }) {
            Text(this.passed() ? '已经覆盖关键链路' : '方向正确，但还缺一个环节')
              .fontSize(13)
              .fontWeight(FontWeight.Medium)
              .fontColor(LociTokens.INK)
              .width('100%')
            Text(this.passed() ?
              '你说明了目标、偏差和更新之间的关系。下一步可以用一个新的例子检验迁移。' :
              '请补充预测和目标如何形成损失，以及损失为什么能影响参数更新。')
              .fontSize(12)
              .fontColor(LociTokens.INK_SOFT)
              .lineHeight(19)
              .width('100%')
            if (!this.passed()) {
              Text('回到讲述')
                .fontSize(12)
                .fontColor(LociTokens.ACCENT)
                .height(LociTokens.CONTROL_MIN)
                .accessibilityRole(AccessibilityRoleType.BUTTON)
                .onClick((): void => {
                  this.submitted = false
                })
            }
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)
        }
        .width('100%')
        .padding(LociTokens.SPACE_4)
        .borderRadius(LociTokens.RADIUS_BLOCK)
        .border({ width: 1, color: this.passed() ? LociTokens.SUCCESS : LociTokens.WARNING })
        .margin({ top: LociTokens.SPACE_4 })

        LociSourceLinks({ sourceIds: this.block.sourceIds, onOpenSource: this.onOpenSource })
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_6, bottom: LociTokens.SPACE_6 })
    .border({ width: { top: 1 }, color: LociTokens.LINE })
  }
}

/** 学习块分发器,真源:LearningBlocks.tsx LearningBlockView。 */
@ComponentV2
export struct LearningBlockView {
  @Param block: LociLearningBlock = { id: '', type: '', title: '', sourceIds: [] } as LociLearningBlock
  @Event onOpenSource: (anchorId: string) => void = (anchorId: string): void => {}
  /** 块级选中操作:「解释」「对比」「提问」,唤起 selection 作用域 Chat。 */
  @Event onSelectionAction: (action: string) => void = (action: string): void => {}

  build() {
    if (this.block.type === 'quiz') {
      QuizBlockView({ block: this.block, onOpenSource: this.onOpenSource })
    } else if (this.block.type === 'feynman') {
      FeynmanBlockView({ block: this.block, onOpenSource: this.onOpenSource })
    } else if (this.block.type === 'explanation') {
      this.explanationBlock()
    } else if (this.block.type === 'example') {
      this.exampleBlock()
    } else if (this.block.type === 'formula_or_conclusion') {
      this.conclusionBlock()
    } else {
      this.citationBlock()
    }
  }

  @Builder
  private blockHeader(kicker: string) {
    Text(kicker)
      .fontSize(11)
      .fontColor(LociTokens.INK_MUTED)
      .width('100%')
    Text(this.block.title)
      .fontSize(LociTokens.FONT_TITLE)
      .fontWeight(FontWeight.Medium)
      .fontColor(LociTokens.INK)
      .width('100%')
      .margin({ top: 6 })
  }

  @Builder
  private explanationBlock() {
    Column() {
      this.blockHeader('讲解')
      Text(this.block.body ?? '')
        .fontSize(LociTokens.FONT_BODY)
        .fontColor(LociTokens.INK)
        .lineHeight(26)
        .width('100%')
        .margin({ top: LociTokens.SPACE_5 })

      // 关键判断:左侧桃色竖线引用块
      Row() {
        Rect().width(2).height('100%').fill(LociTokens.ACCENT)
        Column({ space: 8 }) {
          Text('关键判断')
            .fontSize(11)
            .fontColor(LociTokens.ACCENT)
            .width('100%')
          Text(this.block.keyPoint ?? '')
            .fontSize(LociTokens.FONT_BODY)
            .fontColor(LociTokens.INK)
            .lineHeight(24)
            .width('100%')
        }
        .layoutWeight(1)
        .padding({ left: LociTokens.SPACE_4 })
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_5 })

      // 块级选中操作(本期简化:整块代替文字选区,docs/03 §7.4)
      Row({ space: LociTokens.SPACE_5 }) {
        Text('基于这段内容')
          .fontSize(11)
          .fontColor(LociTokens.INK_MUTED)
        Text('解释')
          .fontSize(12)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onSelectionAction('解释'))
        Text('对比')
          .fontSize(12)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onSelectionAction('对比'))
        Row({ space: 4 }) {
          Text('▷')
            .fontSize(10)
            .fontColor(LociTokens.INK_SOFT)
          Text('提问')
            .fontSize(12)
            .fontColor(LociTokens.INK_SOFT)
        }
        .height(LociTokens.CONTROL_MIN)
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.onSelectionAction('提问'))
      }
      .width('100%')
      .margin({ top: LociTokens.SPACE_3 })

      LociSourceLinks({ sourceIds: this.block.sourceIds, onOpenSource: this.onOpenSource })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_6, bottom: LociTokens.SPACE_6 })
    .border({ width: { top: 1 }, color: LociTokens.LINE })
  }

  @Builder
  private exampleBlock() {
    Column() {
      this.blockHeader('示例')
      Text(this.block.scenario ?? '')
        .fontSize(LociTokens.FONT_BODY)
        .fontColor(LociTokens.INK)
        .lineHeight(26)
        .width('100%')
        .margin({ top: LociTokens.SPACE_5 })
      Column({ space: 6 }) {
        Text('从例子带走')
          .fontSize(11)
          .fontColor(LociTokens.INK_MUTED)
          .width('100%')
        Text(this.block.takeaway ?? '')
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(LociTokens.INK)
          .lineHeight(21)
          .width('100%')
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding(LociTokens.SPACE_4)
      .borderRadius(LociTokens.RADIUS_BLOCK)
      .backgroundColor(LociTokens.SURFACE)
      .margin({ top: LociTokens.SPACE_4 })

      LociSourceLinks({ sourceIds: this.block.sourceIds, onOpenSource: this.onOpenSource })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_6, bottom: LociTokens.SPACE_6 })
    .border({ width: { top: 1 }, color: LociTokens.LINE })
  }

  @Builder
  private conclusionBlock() {
    Column() {
      this.blockHeader((this.block.formula ?? '').length > 0 ? '公式与结论' : '关键结论')
      if ((this.block.formula ?? '').length > 0) {
        Text(this.block.formula ?? '')
          .fontSize(15)
          .fontFamily('monospace')
          .fontColor(LociTokens.ACCENT)
          .lineHeight(24)
          .width('100%')
          .padding(LociTokens.SPACE_4)
          .borderRadius(LociTokens.RADIUS_BLOCK)
          .backgroundColor(LociTokens.SURFACE)
          .margin({ top: LociTokens.SPACE_4 })
      }
      Text(this.block.body ?? '')
        .fontSize(LociTokens.FONT_BODY)
        .fontColor(LociTokens.INK)
        .lineHeight(26)
        .width('100%')
        .margin({ top: LociTokens.SPACE_4 })

      LociSourceLinks({ sourceIds: this.block.sourceIds, onOpenSource: this.onOpenSource })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_6, bottom: LociTokens.SPACE_6 })
    .border({ width: { top: 1 }, color: LociTokens.LINE })
  }

  @Builder
  private citationBlock() {
    Column() {
      Text('“')
        .fontSize(40)
        .fontColor(LociTokens.INK_MUTED)
        .lineHeight(36)
        .width('100%')
      Text(this.block.excerpt ?? '')
        .fontSize(LociTokens.FONT_BODY)
        .fontColor(LociTokens.INK)
        .lineHeight(26)
        .width('100%')
        .margin({ top: LociTokens.SPACE_2 })
      Text(`—— ${this.block.title}`)
        .fontSize(12)
        .fontColor(LociTokens.INK_MUTED)
        .width('100%')
        .margin({ top: LociTokens.SPACE_3 })

      LociSourceLinks({ sourceIds: this.block.sourceIds, onOpenSource: this.onOpenSource })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: LociTokens.SPACE_6, bottom: LociTokens.SPACE_6 })
    .border({ width: { top: 1 }, color: LociTokens.LINE })
    .accessibilityRole(AccessibilityRoleType.BUTTON)
    .accessibilityDescription('引用块,点击查看来源')
    .onClick((): void => {
      const first: string | undefined = this.block.sourceIds[0]
      if (first !== undefined) {
        this.onOpenSource(first)
      } else {
        promptAction.showToast({ message: '这条引用没有可定位的来源', duration: 1800 })
      }
    })
  }
}
