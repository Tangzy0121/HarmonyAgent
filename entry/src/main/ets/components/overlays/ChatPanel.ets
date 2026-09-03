/**
 * Chat 覆盖层 ChatPanel(M3,全屏层;M5e 接真实 agentTurns)
 * 真源:prototype/src/components/overlays/ChatPanel.tsx;docs/product/03 §9;
 * 视觉基准:HelpCC/harmony-migration/baseline/08-chat.png。
 * 结构:顶部(✦ loci Chat + 作用域标题 + 关闭)→ 当前作用域条(点击切换章节⇄项目)
 * → 消息列表(loci/你;assistant 关键判断带可点击「来源 N」;补充说明标记)
 * → user_question 确认卡片(docs/03 §9.4:写操作必须确认;选项 chips + 自由文本)
 * → 错误条(turn_failed/断线,可重试)→ 建议追问 chips → 输入框 + 发送。
 * M5e:回复由 WorkspacePage 经 LociAgentTurnSession 驱动(content_delta 逐字 append);
 * fixture 模式不再伪装回复,发送后提示「演示模式未连接服务」。
 */
import { LociTokens } from '../../theme/LociTokens'
import { AgentTurnQuestion } from '../../loci/agent/LociAgentTurnClient'

/** Chat 消息(UI 态),真源:product.ts ChatMessage。 */
export interface LociChatMessage {
  id: string
  role: string // 'user' | 'assistant'
  body: string
  sourceIds?: string[]
  supplement?: boolean
}

/** 欢迎语,真源:PrototypeContext.tsx initialMessages(逐字一致)。 */
export const LOCI_CHAT_WELCOME: string =
  '我会基于当前作用域回答，并把关键判断连接回资料。你也可以让我比较概念、解释选中文字或提出一个需要确认的学习动作。'

/** fixture 模式发送时的明确提示(M5e:不再有伪装回复)。 */
export const LOCI_CHAT_FIXTURE_HINT: string =
  '演示模式未连接服务。连接 server 后，这里会基于当前学习书真实回答。'

@ComponentV2
export struct ChatPanel {
  /** 顶部作用域标题,如章节标题或「当前学习书 · 概念图」。 */
  @Param chatLabel: string = ''
  /** 作用域文案,如「当前章节」(chatScopeLabel 的结果)。 */
  @Param scopeText: string = ''
  @Param projectTitle: string = ''
  @Param messages: LociChatMessage[] = []
  /** M5e:轮次相位(idle/connecting/streaming/waitingUser/completed/error/cancelled)。 */
  @Param phase: string = 'idle'
  /** M5e:agent 提问(user_question settling 帧);非空时渲染确认卡片。 */
  @Param pendingQuestion: AgentTurnQuestion | null = null
  /** M5e:错误文案(turn_failed payload.message / 断线提示)。 */
  @Param errorText: string = ''
  @Event onSend: (body: string) => void = (body: string): void => {}
  @Event onOpenSource: (anchorId: string) => void = (anchorId: string): void => {}
  @Event onClose: () => void = (): void => {}
  /** M5e:回答 agent 提问(POST answers 并恢复 SSE)。 */
  @Event onAnswer: (answer: string) => void = (answer: string): void => {}
  /** M5e:error 相位重发上一条消息。 */
  @Event onRetry: () => void = (): void => {}
  /** M5e:作用域切换(chapter⇄project,由宿主页改 refs 重开轮)。 */
  @Event onSwitchScope: () => void = (): void => {}

  @Local private draft: string = ''

  private streaming(): boolean {
    return this.phase === 'connecting' || this.phase === 'streaming'
  }

  private submit(): void {
    const body: string = this.draft.trim()
    if (body.length === 0 || this.streaming()) {
      return
    }
    // 有待回答的 agent 提问时,输入框作为自由文本回答通道
    if (this.pendingQuestion !== null) {
      this.onAnswer(body)
    } else {
      this.onSend(body)
    }
    this.draft = ''
  }

  build() {
    Column() {
      // ---- 顶部 ----
      Row() {
        Column({ space: 6 }) {
          Row({ space: 5 }) {
            Text('✦')
              .fontSize(LociTokens.FONT_META)
              .fontColor(LociTokens.AGENT)
            Text('loci Chat')
              .fontSize(LociTokens.FONT_META)
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
          .fontSize(LociTokens.FONT_ICON)
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

      // ---- 当前作用域(M5e:点击在 当前章节⇄当前项目 间切换,改 refs 重开轮) ----
      Row({ space: 6 }) {
        Column({ space: 4 }) {
          Text('当前作用域 · 点击切换')
            .fontSize(LociTokens.FONT_CAPTION)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
          Text(this.scopeText)
            .fontSize(LociTokens.FONT_BODY)
            .fontWeight(FontWeight.Medium)
            .fontColor(LociTokens.INK)
            .width('100%')
          Text(this.projectTitle)
            .fontSize(LociTokens.FONT_CAPTION)
            .fontColor(LociTokens.INK_MUTED)
            .width('100%')
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
        Text('›')
          .fontSize(LociTokens.FONT_SUBTITLE)
          .fontColor(LociTokens.INK_MUTED)
      }
      .width('100%')
      .constraintSize({ minHeight: LociTokens.CONTROL_MIN })
      .padding({ left: LociTokens.PAGE_X, right: LociTokens.PAGE_X, top: 14, bottom: 14 })
      .border({ width: { bottom: 1 }, color: LociTokens.LINE })
      .accessibilityRole(AccessibilityRoleType.BUTTON)
      .accessibilityDescription(`当前作用域:${this.scopeText},点击切换`)
      .onClick((): void => this.onSwitchScope())

      // ---- 消息列表 ----
      List() {
        ForEach(this.messages, (message: LociChatMessage) => {
          ListItem() {
            Column({ space: 6 }) {
              Text(message.role === 'assistant' ? 'loci' : '你')
                .fontSize(LociTokens.FONT_CAPTION)
                .fontColor(message.role === 'assistant' ? LociTokens.AGENT : LociTokens.INK_MUTED)
                .width('100%')
              Text(message.body)
                .fontSize(LociTokens.FONT_BODY)
                .fontColor(LociTokens.INK)
                .lineHeight(24)
                .width('100%')
              if (message.supplement === true) {
                Text('补充说明 · 不来自当前资料')
                  .fontSize(LociTokens.FONT_MICRO)
                  .fontColor(LociTokens.INK_MUTED)
                  .width('100%')
              }
              if ((message.sourceIds ?? []).length > 0) {
                Row({ space: LociTokens.SPACE_4 }) {
                  ForEach(message.sourceIds ?? [], (sourceId: string, index: number) => {
                    Text(`来源 ${index + 1}`)
                      .fontSize(LociTokens.FONT_CAPTION)
                      .fontColor(LociTokens.ACTION)
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
          // M7a:key 必须随内容变化——LociChatMessage 是普通 interface,同 id 复用节点时
          // body 增长不会重渲(content_delta 逐字上屏曾因此空白,日志收到 77 帧 UI 不动)
        }, (message: LociChatMessage): string => `${message.id}:${message.body.length}`)

        // ---- agent 提问确认卡片(user_question,docs/03 §9.4:写操作必须确认) ----
        if (this.pendingQuestion !== null) {
          ListItem() {
            Column({ space: 8 }) {
              Text('loci 提问 · 需要确认')
                .fontSize(LociTokens.FONT_CAPTION)
                .fontColor(LociTokens.INK_MUTED)
                .width('100%')
              Text(this.pendingQuestion?.prompt ?? '')
                .fontSize(LociTokens.FONT_SMALL)
                .fontWeight(FontWeight.Medium)
                .fontColor(LociTokens.INK)
                .lineHeight(21)
                .width('100%')
              ForEach(this.pendingQuestion?.options ?? [], (option: string) => {
                Text(option)
                  .fontSize(LociTokens.FONT_META)
                  .fontColor(LociTokens.INK)
                  .width('100%')
                  .constraintSize({ minHeight: LociTokens.CONTROL_MIN })
                  .padding({ top: 6, bottom: 6 })
                  .border({ width: { bottom: 1 }, color: LociTokens.LINE })
                  .accessibilityRole(AccessibilityRoleType.BUTTON)
                  .onClick((): void => this.onAnswer(option))
              }, (option: string): string => option)
              if (this.pendingQuestion?.allowFreeText === true) {
                Text('也可以在下方输入自己的回答后发送')
                  .fontSize(LociTokens.FONT_CAPTION)
                  .fontColor(LociTokens.INK_MUTED)
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

        // ---- 错误条(turn_failed / 断线重连失败;可重发) ----
        if (this.phase === 'error') {
          ListItem() {
            Column({ space: 8 }) {
              Text(this.errorText.length > 0 ? this.errorText : '学习助手生成失败,请重试。')
                .fontSize(LociTokens.FONT_LABEL)
                .fontColor(LociTokens.DANGER)
                .lineHeight(19)
                .width('100%')
              Text('重试')
                .fontSize(LociTokens.FONT_META)
                .fontWeight(FontWeight.Medium)
                .fontColor(LociTokens.INK)
                .textAlign(TextAlign.Center)
                .height(LociTokens.CONTROL_MIN)
                .padding({ left: 20, right: 20 })
                .borderRadius(LociTokens.RADIUS_CONTROL)
                .border({ width: 1, color: LociTokens.LINE_STRONG })
                .accessibilityRole(AccessibilityRoleType.BUTTON)
                .onClick((): void => this.onRetry())
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
            .padding({ top: LociTokens.SPACE_2, bottom: LociTokens.SPACE_4 })
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
          .fontSize(LociTokens.FONT_LABEL)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            this.draft = '为什么训练损失不能代表泛化能力？'
          })
        Text('建议一个复习动作')
          .fontSize(LociTokens.FONT_LABEL)
          .fontColor(LociTokens.INK_SOFT)
          .height(LociTokens.CONTROL_MIN)
          .accessibilityRole(AccessibilityRoleType.BUTTON)
          .onClick((): void => {
            // M5e:turns 协议没有「直接创建复习」action,改为发普通消息由 agent 走 user_question 流程
            this.draft = '帮我把这一章需要巩固的重点安排进复习'
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
          .fontSize(LociTokens.FONT_META)
          .fontColor(LociTokens.INK)
          .placeholderColor(LociTokens.INK_MUTED)
          .placeholderFont({ size: 13 })
          .caretColor(LociTokens.ACTION)
          .backgroundColor(LociTokens.SURFACE)
          .borderRadius(LociTokens.RADIUS_BLOCK)
          .padding({ left: 14, right: 14, top: 12, bottom: 12 })
          .accessibilityText('Chat 输入框')
          .enabled(!this.streaming())
          .onChange((value: string): void => {
            this.draft = value
          })
        Stack() {
          Text('→')
            .fontSize(LociTokens.FONT_SUBTITLE)
            .fontColor(this.draft.trim().length > 0 ? LociTokens.ACTION_INK : LociTokens.INK_MUTED)
        }
        .width(LociTokens.CONTROL_MIN)
        .height(LociTokens.CONTROL_MIN)
        .borderRadius(LociTokens.CONTROL_MIN / 2)
        .backgroundColor(this.draft.trim().length > 0 ? LociTokens.ACTION : LociTokens.SURFACE)
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
