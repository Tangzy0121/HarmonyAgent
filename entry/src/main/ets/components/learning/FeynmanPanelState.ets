export const FEYNMAN_EFFECTIVE_LIMIT: number = 2000
export const FEYNMAN_RAW_LIMIT: number = 2400

export class FeynmanPanelState {
  rawText: string
  effectiveLength: number
  canSubmit: boolean
  submitText: string

  constructor(rawText: string, effectiveLength: number, canSubmit: boolean, submitText: string) {
    this.rawText = rawText
    this.effectiveLength = effectiveLength
    this.canSubmit = canSubmit
    this.submitText = submitText
  }
}

export function limitFeynmanDraft(value: string): string {
  return value.length > FEYNMAN_RAW_LIMIT ? value.substring(0, FEYNMAN_RAW_LIMIT) : value
}

export function buildFeynmanPanelState(rawText: string): FeynmanPanelState {
  const trimmed: string = rawText.trim()
  const valid: boolean = trimmed.length > 0 && trimmed.length <= FEYNMAN_EFFECTIVE_LIMIT
  return new FeynmanPanelState(rawText, trimmed.length, valid, valid ? trimmed : '')
}
