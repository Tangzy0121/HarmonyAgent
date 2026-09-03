/**
 * loci 纯黑 editorial 设计 Token(ArkTS)
 * 真源:prototype/src/styles/tokens.css(2026-09-02, commit d0da27a)
 * 纪律:屏内纯黑、零阴影/渐变/模糊;功能只靠字阶/字重/灰度/图形/细线/留白。
 * 黄色只做内容色块与编辑式强调,不作为按钮或唯一状态信号。
 * 本文件是 entry 正式页面的唯一设计 Token 来源。
 */
export class LociTokens {
  // ---- 画布与墨色 ----
  static readonly OUTSIDE: string = '#e9e9ee'          // 屏外银灰
  static readonly SCREEN: string = '#000000'           // 屏内纯黑画布
  static readonly INK: string = '#f3f2ee'              // 主文字(柔白)
  static readonly INK_SOFT: string = '#A8F3F2EE'       // 66% 次级文字
  static readonly INK_MUTED: string = '#66F3F2EE'      // 40% 弱提示
  static readonly LINE: string = '#33F3F2EE'           // 20% 细线
  static readonly LINE_STRONG: string = '#61F3F2EE'    // 38% 强细线
  static readonly SURFACE: string = '#161616'          // 内容色块
  static readonly SURFACE_RAISED: string = '#202020'   // 浮起色块

  // ---- 装饰色与黑白控件 ----
  static readonly ACCENT: string = '#c8bc40'           // 参考图芥末黄,仅用于编辑式点缀
  static readonly ACCENT_INK: string = '#17160b'       // 黄色内容色块上的文字
  static readonly ACTION: string = LociTokens.INK      // 所有高优先级控件统一柔白
  static readonly ACTION_INK: string = LociTokens.SCREEN
  static readonly CARD_BLUE: string = '#93a9be'        // 目标卡·灰蓝
  static readonly CARD_MIST: string = '#a9b3bb'        // 目标卡·雾灰
  static readonly CARD_STONE: string = '#b8b0a4'       // 目标卡·暖石
  static readonly AGENT: string = LociTokens.INK_SOFT  // Agent 由图标与标签识别
  static readonly SUCCESS: string = LociTokens.INK
  static readonly WARNING: string = LociTokens.INK_SOFT
  static readonly DANGER: string = LociTokens.INK

  // ---- 字阶(vp;真源为 rem/clamp,按 390 宽移动画布取定值)----
  static readonly FONT_DISPLAY: number = 48            // clamp(3rem,12vw,3.55rem)
  static readonly FONT_DISPLAY_REVIEW: number = 44
  static readonly FONT_PAGE: number = 41               // clamp(2.55rem,10vw,3.1rem)
  static readonly FONT_DISPLAY_MEDIUM: number = 40
  static readonly FONT_DISPLAY_SMALL: number = 38
  static readonly FONT_SECTION: number = 28
  static readonly FONT_ICON: number = 26
  static readonly FONT_HEADING: number = 24
  static readonly FONT_PAGE_SMALL: number = 23
  static readonly FONT_SUBSECTION: number = 22
  static readonly FONT_TITLE: number = 20
  static readonly FONT_SUBTITLE: number = 18
  static readonly FONT_BODY_LARGE: number = 17
  static readonly FONT_CONTROL: number = 16
  static readonly FONT_BODY: number = 15
  static readonly FONT_SMALL: number = 14
  static readonly FONT_META: number = 13
  static readonly FONT_LABEL: number = 12
  static readonly FONT_CAPTION: number = 11
  static readonly FONT_MICRO: number = 10
  static readonly FONT_TINY: number = 9

  // ---- 间距(vp)----
  static readonly SPACE_1: number = 4
  static readonly SPACE_2: number = 8
  static readonly SPACE_3: number = 12
  static readonly SPACE_4: number = 16
  static readonly SPACE_5: number = 24
  static readonly SPACE_6: number = 32
  static readonly SPACE_7: number = 48
  static readonly SPACE_8: number = 72
  static readonly PAGE_X: number = 24                  // 页面水平边距

  // ---- 控件 ----
  static readonly CONTROL_HEIGHT: number = 46
  static readonly CONTROL_MIN: number = 44             // 无障碍最小触控(docs/03 §12)
  static readonly RADIUS_CONTROL: number = 999         // 胶囊
  static readonly RADIUS_BLOCK: number = 8

  // ---- 动效(真源 cubic-bezier(0.16,1,0.3,1),ArkUI 用 curves 引用)----
  static readonly MOTION_MS: number = 300
}
