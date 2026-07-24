export interface LociGlassSpec {
  blurRadius: number
  tintOpacity: number
  saturation: number
  brightness: number
  refractionStrength: number
  dispersion: number
  edgeWidth: number
  edgeLight: number
  cornerRadius: number
  interactionStrength: number
}

export type LociGlassPreset = 'balanced' | 'clear' | 'refractive'

export const lociGlassPresets: Record<LociGlassPreset, LociGlassSpec> = {
  balanced: {
    blurRadius: 18,
    tintOpacity: 0.28,
    saturation: 1.35,
    brightness: 1.05,
    refractionStrength: 18,
    dispersion: 0.12,
    edgeWidth: 0.18,
    edgeLight: 0.72,
    cornerRadius: 26,
    interactionStrength: 0.7,
  },
  clear: {
    blurRadius: 10,
    tintOpacity: 0.18,
    saturation: 1.22,
    brightness: 1.04,
    refractionStrength: 12,
    dispersion: 0.08,
    edgeWidth: 0.14,
    edgeLight: 0.82,
    cornerRadius: 26,
    interactionStrength: 0.55,
  },
  refractive: {
    blurRadius: 13,
    tintOpacity: 0.22,
    saturation: 1.48,
    brightness: 1.07,
    refractionStrength: 28,
    dispersion: 0.2,
    edgeWidth: 0.24,
    edgeLight: 0.9,
    cornerRadius: 26,
    interactionStrength: 0.9,
  },
}
