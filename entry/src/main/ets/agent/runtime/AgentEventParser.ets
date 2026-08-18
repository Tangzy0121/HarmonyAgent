import { SseFrame } from '../SseFrameParser'

export type AgentEventType = 'turn_started' | 'activity' | 'content_delta' | 'citation' |
  'user_question' | 'evidence_recorded' | 'turn_completed' | 'turn_failed' | 'unknown'

interface AgentEventPayloadWire {
  label?: string
  text?: string
  sourceId?: string
  fileName?: string
  pageRange?: string
  questionId?: string
  prompt?: string
  options?: Array<string>
  allowFreeText?: boolean
  evidenceId?: string
  projectionStatus?: string
  code?: string
  message?: string
}

interface AgentEventWire {
  version: string
  turnId: string
  eventId: string
  timestamp: string
  idempotencyKey: string
  type: string
  payload: AgentEventPayloadWire
}

export class AgentCitation {
  sourceId: string
  fileName: string
  pageRange: string
  label: string

  constructor(sourceId: string, fileName: string, pageRange: string) {
    this.sourceId = sourceId
    this.fileName = fileName
    this.pageRange = pageRange
    this.label = pageRange.length > 0 ? `${fileName} · ${pageRange}` : fileName
  }
}

export class AgentQuestion {
  questionId: string
  prompt: string
  options: Array<string>
  allowFreeText: boolean

  constructor(questionId: string, prompt: string, options: Array<string>, allowFreeText: boolean) {
    this.questionId = questionId
    this.prompt = prompt
    this.options = options
    this.allowFreeText = allowFreeText
  }
}

export class AgentEventEnvelopeV1 {
  version: string = '1'
  turnId: string
  eventId: string
  timestamp: string = '2026-08-14T00:00:00.000Z'
  idempotencyKey: string
  type: AgentEventType
  eventName: string
  text: string = ''
  activityLabel: string = ''
  citation: AgentCitation | null = null
  question: AgentQuestion | null = null
  evidenceId: string = ''
  projectionStatus: string = ''
  errorCode: string = ''
  errorMessage: string = ''

  constructor(turnId: string, eventId: string, type: AgentEventType) {
    this.turnId = turnId
    this.eventId = eventId
    this.type = type
    this.eventName = type
    this.idempotencyKey = `${turnId}:${type}:${eventId}`
  }
}

function knownType(value: string): AgentEventType | null {
  if (value === 'turn_started' || value === 'activity' || value === 'content_delta' ||
    value === 'citation' || value === 'user_question' || value === 'evidence_recorded' ||
    value === 'turn_completed' || value === 'turn_failed') {
    return value
  }
  return null
}

function required(value: string | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('invalid_agent_event')
  }
  return value.trim()
}

function validCommon(wire: AgentEventWire): void {
  if (wire.version !== '1' || typeof wire.turnId !== 'string' || wire.turnId.trim().length === 0 ||
    typeof wire.eventId !== 'string' || !/^\d+$/.test(wire.eventId) ||
    !Number.isSafeInteger(Number(wire.eventId)) || Number(wire.eventId) < 1 ||
    typeof wire.timestamp !== 'string' || Number.isNaN(Date.parse(wire.timestamp)) ||
    typeof wire.idempotencyKey !== 'string' || wire.idempotencyKey.trim().length === 0 ||
    typeof wire.type !== 'string' || wire.type.trim().length === 0 || wire.type !== wire.type.trim() ||
    typeof wire.payload !== 'object' || wire.payload === null ||
    Array.isArray(wire.payload)) {
    throw new Error('invalid_agent_event')
  }
}

function parsedKnownEvent(wire: AgentEventWire, type: AgentEventType): AgentEventEnvelopeV1 {
  const event = new AgentEventEnvelopeV1(wire.turnId.trim(), wire.eventId, type)
  event.timestamp = wire.timestamp
  event.idempotencyKey = wire.idempotencyKey.trim()
  if (type === 'content_delta') {
    event.text = required(wire.payload.text)
  } else if (type === 'activity') {
    event.activityLabel = required(wire.payload.label)
  } else if (type === 'citation') {
    event.citation = new AgentCitation(required(wire.payload.sourceId),
      required(wire.payload.fileName), typeof wire.payload.pageRange === 'string' ? wire.payload.pageRange : '')
  } else if (type === 'user_question') {
    if (!Array.isArray(wire.payload.options) || typeof wire.payload.allowFreeText !== 'boolean') {
      throw new Error('invalid_agent_event')
    }
    const options: Array<string> = []
    for (let index: number = 0; index < wire.payload.options.length; index++) {
      options.push(required(wire.payload.options[index]))
    }
    event.question = new AgentQuestion(required(wire.payload.questionId),
      required(wire.payload.prompt), options, wire.payload.allowFreeText)
  } else if (type === 'evidence_recorded') {
    event.evidenceId = required(wire.payload.evidenceId)
    event.projectionStatus = typeof wire.payload.projectionStatus === 'string' ? wire.payload.projectionStatus : ''
  } else if (type === 'turn_failed') {
    event.errorCode = required(wire.payload.code)
    event.errorMessage = typeof wire.payload.message === 'string' ? wire.payload.message : ''
  }
  return event
}

export function parseAgentEventJson(payload: string): AgentEventEnvelopeV1 | null {
  try {
    const wire: AgentEventWire = JSON.parse(payload) as AgentEventWire
    validCommon(wire)
    const type: AgentEventType | null = knownType(wire.type)
    if (type === null) {
      const ignored = new AgentEventEnvelopeV1(wire.turnId.trim(), wire.eventId, 'unknown')
      ignored.timestamp = wire.timestamp
      ignored.idempotencyKey = wire.idempotencyKey.trim()
      ignored.eventName = wire.type
      return ignored
    }
    return parsedKnownEvent(wire, type)
  } catch (error) {
    throw new Error('invalid_agent_event')
  }
}

export function parseAgentEventEnvelope(frame: SseFrame): AgentEventEnvelopeV1 | null {
  const event: AgentEventEnvelopeV1 | null = parseAgentEventJson(frame.data)
  if (event !== null && frame.type !== event.eventName) {
    throw new Error('invalid_agent_event')
  }
  return event
}
