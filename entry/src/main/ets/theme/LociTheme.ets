/**
 * ArkUI semantic tokens for the continuous knowledge field.
 *
 * HarmonyOS parses eight digit colors as #AARRGGBB. Keep alpha first so the
 * translucent smoke edges do not turn into opaque yellow focus-like borders.
 * Content stays stable and readable; smoke crystal is reserved for controls.
 */
export class LociTheme {
  static readonly CANVAS_TOP: string = '#CBC7CE'
  static readonly CANVAS_MIDDLE: string = '#B7B2B9'
  static readonly CANVAS_BOTTOM: string = '#9F999F'
  static readonly CANVAS_GLOW: string = '#54FFFFFF'
  static readonly CANVAS_GLOW_SOFT: string = '#30F8F7FA'
  static readonly CANVAS_DEPTH: string = '#28615C72'
  static readonly CANVAS_PEACH: string = '#32D38D7E'

  static readonly TEXT_PRIMARY: string = '#F8F5F3'
  static readonly TEXT_SECONDARY: string = '#B8FFFAF8'
  static readonly TEXT_TERTIARY: string = '#80FFFAF8'
  static readonly TEXT_DARK: string = '#28252A'
  static readonly TEXT_DARK_MUTED: string = '#6B656D'
  static readonly TEXT_DARK_TERTIARY: string = '#918A92'

  static readonly CONTENT_SURFACE: string = '#F7F3F0'
  static readonly CONTENT_SURFACE_ALT: string = '#EBE5E7'
  static readonly CONTENT_SURFACE_PRESSED: string = '#E3DCDF'
  static readonly HAIRLINE_DARK: string = '#202A252B'
  static readonly HAIRLINE_LIGHT: string = '#24FFFFFF'
  static readonly HAIRLINE_BRIGHT: string = '#47FFFFFF'

  // Native smoke fallback plus the highlight layers used by the ArkUI renderer.
  static readonly SMOKE_HIGH_FALLBACK: string = '#80676264'
  static readonly SMOKE_LOW_FALLBACK: string = '#554A4648'
  static readonly SMOKE_PROFILE: string = '#918C90'
  static readonly SMOKE_NAV: string = '#898487'
  static readonly SMOKE_FOCUS_TOP: string = '#918C8E'
  static readonly SMOKE_FOCUS_BOTTOM: string = '#7E787B'
  static readonly SMOKE_SESSION: string = '#766D72'
  static readonly SMOKE_TAG: string = '#777174'
  static readonly SMOKE_HIGHLIGHT: string = '#2EFFFFFF'
  static readonly SMOKE_INNER_EDGE: string = '#2FFFFFFF'
  static readonly SMOKE_ACTIVE: string = '#EBF8F4F2'
  static readonly SMOKE_ACTIVE_PRESSED: string = '#DDE9E4E2'

  static readonly PEACH: string = '#E3A08E'
  static readonly PEACH_SOFT: string = '#2FD38D7E'
  static readonly PEACH_SURFACE: string = '#54B97568'
  static readonly PEACH_SURFACE_STRONG: string = '#8AB06C62'
  static readonly PEACH_PRESSED: string = '#D69180'
  static readonly SHADOW: string = '#30302A36'
  static readonly SHADOW_SOFT: string = '#1F2B2530'

  static readonly PAGE_SIDE: number = 20
  static readonly CONTROL_MIN: number = 44
  static readonly NAV_HEIGHT: number = 66
  static readonly NAV_RADIUS: number = 27
  static readonly AGENT_SIZE: number = 66
  static readonly CONTENT_RADIUS: number = 28
  static readonly FOCUS_RADIUS: number = 30

  static readonly DISPLAY_SIZE: number = 58
  static readonly TITLE_SIZE: number = 27
  static readonly BODY_SIZE: number = 15
  static readonly LABEL_SIZE: number = 11
}
