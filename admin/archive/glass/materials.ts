// Archived material types for the retired glass experiment.
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
    blurRadius: 26,
    tintOpacity: 0.22,
    saturation: 0.98,
    brightness: 1.02,
    refractionStrength: 17,
    dispersion: 0.055,
    edgeWidth: 0.2,
    edgeLight: 0.56,
    cornerRadius: 26,
    interactionStrength: 0.9,
  },
}
