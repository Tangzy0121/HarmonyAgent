/**
 * loci 纯黑 editorial 设计 Token(ArkTS)
 * 真源:prototype/src/styles/tokens.css(2026-08-24, PR #8)
 * 纪律:屏内纯黑、零阴影/渐变/模糊;层级只靠字阶/字重/灰度/细线/留白。
 * 注意:LociTheme.ets 是旧烟晶视觉,新页面一律使用本文件;旧文件随旧页面逐步退役。
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

  // ---- 语义色 ----
  static readonly ACCENT: string = '#dd9a89'           // 桃色学习动作
  static readonly ACCENT_INK: string = '#18100e'       // 桃色上的文字
  static readonly CARD_BLUE: string = '#93a9be'        // 目标卡·灰蓝
  static readonly CARD_MIST: string = '#a9b3bb'        // 目标卡·雾灰
  static readonly CARD_STONE: string = '#b8b0a4'       // 目标卡·暖石
  static readonly AGENT: string = '#bca9e9'            // Agent 紫
  static readonly SUCCESS: string = '#8fc7a5'
  static readonly WARNING: string = '#d6b179'
  static readonly DANGER: string = '#df938b'

  // ---- 字阶(vp;真源为 rem/clamp,按 390 宽移动画布取定值)----
  static readonly FONT_DISPLAY: number = 48            // clamp(3rem,12vw,3.55rem)
  static readonly FONT_PAGE: number = 41               // clamp(2.55rem,10vw,3.1rem)
  static readonly FONT_SECTION: number = 28
  static readonly FONT_TITLE: number = 20
  static readonly FONT_BODY: number = 15
  static readonly FONT_LABEL: number = 12

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
