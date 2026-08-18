export type AgentEventType =
  | 'turn_started'
  | 'activity'
  | 'content_delta'
  | 'citation'
  | 'user_question'
  | 'evidence_recorded'
  | 'turn_completed'
  | 'turn_failed'

export interface AgentEventEnvelopeV1<T = Record<string, unknown>> {
  version: '1'
  turnId: string
  eventId: string
  timestamp: string
  idempotencyKey: string
  type: AgentEventType
  payload: T
}

export interface CreateAgentEventInput<T> {
  turnId: string
  sequence: number
  type: AgentEventType
  payload: T
  timestamp?: string
  idempotencyKey?: string
}

function requiredIdentifier(value: string, code: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(code)
  return normalized
}

export function createAgentEvent<T>(
  input: CreateAgentEventInput<T>,
): AgentEventEnvelopeV1<T> {
  const turnId = requiredIdentifier(input.turnId, 'invalid_turn_id')
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new Error('invalid_event_sequence')
  }
  const timestamp = input.timestamp ?? new Date().toISOString()
  if (Number.isNaN(Date.parse(timestamp))) throw new Error('invalid_event_timestamp')
  const eventId = String(input.sequence)
  const idempotencyKey = input.idempotencyKey === undefined
    ? `${turnId}:${input.type}:${eventId}`
    : requiredIdentifier(input.idempotencyKey, 'invalid_idempotency_key')

  return {
    version: '1',
    turnId,
    eventId,
    timestamp,
    idempotencyKey,
    type: input.type,
    payload: input.payload,
  }
}
