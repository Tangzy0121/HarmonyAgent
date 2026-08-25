/**
 * Chat 覆盖层 ChatPanel(M3,全屏层)
 * 真源:prototype/src/components/overlays/ChatPanel.tsx;docs/product/03 §9;
 * 视觉基准:HelpCC/harmony-migration/baseline/08-chat.png。
 * 结构:顶部(✦ loci Chat + 作用域标题 + 关闭)→ 当前作用域条 → 消息列表
 * (loci/你;assistant 关键判断带可点击「来源 N」;补充说明标记)→ 建议动作确认卡片
 * (docs/03 §9.4:写操作必须确认)→ 建议追问 chips → 输入框 + 发送。
 * 回复为 Mock(逐字搬原型固定回复,代码内标注);消息由 WorkspacePage 持有,关闭不丢会话。
 */
import { LociTokens } from '../../theme/LociTokens'

/** Chat 消息(UI 态),真源:product.ts ChatMessage。 */
export interface LociChatMessage {
  id: string
  role: string // 'user' | 'assistant'
  body: string
  sourceIds?: string[]
  supplement?: boolean
}

/** Mock 欢迎语,真源:PrototypeContext.tsx initialMessages(逐字一致)。 */
export const LOCI_CHAT_WELCOME: string =
  '我会基于当前作用域回答，并把关键判断连接回资料。你也可以让我比较概念、解释选中文字或提出一个需要确认的学习动作。'

/** Mock 固定回复,真源:PrototypeContext.tsx send_chat(逐字一致)。 */
export const LOCI_CHAT_MOCK_REPLY: string =
  '这里要先区分“训练中的反馈”和“训练后的评估”。损失函数负责告诉模型当前预测偏差有多大；独立评估则检查这种规律能否迁移到未见数据。两者相互关联，但不能互相替代。'

@ComponentV2
export struct ChatPanel {
  /** 顶部作用域标题,如章节标题或「当前学习书 · 概念图」。 */
  @Param chatLabel: string = ''
  /** 作用域文案,如「当前章节」(chatScopeLabel 的结果)。 */
  @Param scopeText: string = ''
  @Param projectTitle: string = ''
  @Param messages: LociChatMessage[] = []
  @Event onSend: (body: string) => void = (body: string): void => {}
  @Event onOpenSource: (anchorId: string) => void = (anchorId: string): void => {}
  @Event onClose: () => void = (): void => {}
  /** M4:建议动作「确认创建」落地回调(创建复习任务,Mock 由宿主页处理)。 */
  @Event onConfirmAction: () => void = (): void => {}

  @Local private draft: string = ''
  @Local private showAction: boolean = false
  @Local private actionConfirmed: boolean = false

  private submit(): void {
    const body: string = this.draft.trim()
    if (body.length === 0) {
      return
    }
    this.onSend(body)
    this.draft = ''
  }

  build() {
    Column() {
      // ---- 顶部 ----
      Row() {
        Column({ space: 6 }) {
          Row({ space: 5 }) {
            Text('✦')
              .fontSize(13)
              .fontColor(LociTokens.AGENT)
            Text('loci Chat')
              .fontSize(13)
              .fontColor(LociTokens.AGENT)
          }
          Text(this.chatLabel)
            .fontSize(LociTokens.FONT_TITLE)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)

        Text('×')
          .fontSize(26)
          .fontColor(LociTokens.INK)
          .textAlign(TextAlign.Center)
          .width(LociTokens.CONTROL_MIN)
          .height(LociTokens.CONTROL_MIN)
          .border({ width: 1, color: LociTokens.LINE_STRONG })
          .accessibilityText('关闭 Chat')
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => this.onClose())
      }
      .width('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 56, bottom: LociTokens.SPACE_4 })
      .border({ width: { bottom: 1 }, color: LociTokens.LINE })

      // ---- 当前作用域 ----
      Row({ space: 6 }) {
        Column({ space: 4 }) {
          Text('当前作用域')
            .fontSize(11)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
          Text(this.scopeText)
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
            .width('100%')
          Text(this.projectTitle)
            .fontSize(11)
            .fontColor(LociTokens.INK_MUTED)
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
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 14, bottom: 14 })
      .border({ width: { bottom: 1 }, color: LociTokens.LINE })
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .accessibilityDescription(`当前作用域:${this.scopeText}`)
      .onClick((): void => {
        // 作用域切换入口保持可见(docs/03 §9.2);范围切换本身后续切片接入
      })

      // ---- 消息列表 ----
      List() {
        ForEach(this.messages, (message: LociChatMessage) => {
          ListItem() {
            Column({ space: 6 }) {
              Text(message.role === 'assistant' ? 'loci' : '你')
                .fontSize(11)
                .fontColor(message.role === 'assistant' ? LociTokens.AGENT : LociTokens.INK_MUTED)
                .width('100%')
              Text(message.body)
                .fontSize(LociTokens.FONT_BODY)
                .fontColor(LociTokens.INK)
                .lineHeight(24)
                .width('100%')
              if (message.supplement === true) {
                Text('补充说明 · 不来自当前资料')
                  .fontSize(10)
                  .fontColor(LociTokens.INK_MUTED)
                  .width('100%')
              }
              if ((message.sourceIds ?? []).length > 0) {
                Row({ space: LociTokens.SPACE_4 }) {
                  ForEach(message.sourceIds ?? [], (sourceId: string, index: number) => {
                    Text(`来源 ${index + 1}`)
                      .fontSize(11)
                      .fontColor(LociTokens.ACCENT)
                      .height(LociTokens.CONTROL_MIN)
                      .accessibilityRole(AccessibilityRoleType.BUTTON)
                      .onClick((): void => this.onOpenSource(sourceId))
                  }, (sourceId: string): string => sourceId)
                }
                .width('100%')
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
            .padding({ top: LociTokens.SPACE_4, bottom: LociTokens.SPACE_4 })
          }
        }, (message: LociChatMessage): string => message.id)

        // ---- 建议动作确认卡片(docs/03 §9.4) ----
        if (this.showAction) {
          ListItem() {
            Column({ space: 8 }) {
              Text('建议动作 · 需要确认')
                .fontSize(11)
                .fontColor(LociTokens.INK_MUTED)
                .width('100%')
              Text('把“损失与泛化”加入下一次复习')
                .fontSize(14)
                .fontWeight(FontWeight.Medium)
                .fontColor(LociTokens.INK)
                .width('100%')
              Text('这会创建一个复习任务，但不会直接修改概念状态。')
                .fontSize(12)
                .fontColor(LociTokens.INK_SOFT)
                .lineHeight(19)
                .width('100%')
              if (this.actionConfirmed) {
                Row({ space: 5 }) {
                  Text('✓')
                    .fontSize(13)
                    .fontColor(LociTokens.SUCCESS)
                  Text('已创建，稍后可以在今日处理')
                    .fontSize(12)
                    .fontColor(LociTokens.SUCCESS)
                }
                .width('100%')
              } else {
                Row({ space: LociTokens.SPACE_3 }) {
                  Text('确认创建')
                    .fontSize(13)
                    .fontWeight(FontWeight.Medium)
                    .fontColor(LociTokens.ACCENT_INK)
                    .textAlign(TextAlign.Center)
                    .height(LociTokens.CONTROL_MIN)
                    .padding({ left: 20, right: 20 })
                    .borderRadius(LociTokens.RADIUS_CONTROL)
                    .backgroundColor(LociTokens.ACCENT)
                    .accessibilityRole(AccessibilityRoleType.BUTTON)
                    .onClick((): void => {
                      this.actionConfirmed = true
                      this.onConfirmAction()
                    })
                  Text('取消')
                    .fontSize(13)
                    .fontColor(LociTokens.INK_SOFT)
                    .textAlign(TextAlign.Center)
                    .height(LociTokens.CONTROL_MIN)
                    .padding({ left: 20, right: 20 })
                    .accessibilityRole(AccessibilityRoleType.BUTTON)
                    .onClick((): void => {
                      this.showAction = false
                    })
                }
                .width('100%')
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
            .padding(LociTokens.SPACE_4)
            .borderRadius(LociTokens.RADIUS_BLOCK)
            .border({ width: 1, color: LociTokens.LINE_STRONG })
            .margin({ top: LociTokens.SPACE_2, bottom: LociTokens.SPACE_4 })
          }
        }
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X })

      // ---- 建议追问 ----
      Row({ space: LociTokens.SPACE_5 }) {
        Text('解释关键区别')
          .fontSize(12)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            this.draft = '为什么训练损失不能代表泛化能力？'
          })
        Text('建议一个复习动作')
          .fontSize(12)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            this.showAction = true
            this.actionConfirmed = false
          })
      }
      .width('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: LociTokens.SPACE_2, bottom: LociTokens.SPACE_2 })
      .border({ width: { top: 1 }, color: LociTokens.LINE })

      // ---- 输入区(键盘出现时不遮挡,ArkUI 默认避让) ----
      Row({ space: LociTokens.SPACE_3 }) {
        TextArea({ placeholder: `基于${this.chatLabel}提问…`, text: this.draft })
          .layoutWeight(1)
          .constraintSize({ minHeight: LociTokens.CONTROL_MIN, maxHeight: 96 })
          .fontSize(13)
          .fontColor(LociTokens.INK)
          .placeholderColor(LociTokens.INK_MUTED)
          .placeholderFont({ size: 13 })
          .caretColor(LociTokens.ACCENT)
          .backgroundColor(LociTokens.SURFACE)
          .borderRadius(LociTokens.RADIUS_BLOCK)
          .padding({ left: 14, right: 14, top: 12, bottom: 12 })
          .accessibilityText('Chat 输入框')
          .onChange((value: string): void => {
            this.draft = value
          })
        Stack() {
          Text('→')
            .fontSize(18)
            .fontColor(this.draft.trim().length > 0 ? LociTokens.ACCENT_INK : LociTokens.INK_MUTED)
        }
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .borderRadius(LociTokens.CONTROL_MIN / 2)
        .backgroundColor(this.draft.trim().length > 0 ? LociTokens.ACCENT : LociTokens.SURFACE)
        .accessibilityText('发送问题')
        .accessibilityRole(AccessibilityRoleType.BUTTON)
        .onClick((): void => this.submit())
      }
      .width('100%')
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: LociTokens.SPACE_2, bottom: 20 })
      .border({ width: { top: 1 }, color: LociTokens.LINE })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(LociTokens.SCREEN)
  }
}
