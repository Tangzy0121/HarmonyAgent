export type CapabilityId = 'free_chat' | 'guided_learning'

export type TurnStatus =
  | 'queued'
  | 'running'
  | 'waiting_user'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'cancelled'

export type AgentSurface = 'today' | 'learning' | 'library' | 'agent'

export interface AgentObjectRefs {
  bookId?: string
  chapterId?: string
  blockId?: string
  conceptId?: string
  documentId?: string
}

export interface StartTurnRequestV1 {
  version: '1'
  message: string
  surface: AgentSurface
  refs: AgentObjectRefs
  capabilityHint?: CapabilityId
}

export interface RuntimeActor {
  userId: string
  workspaceId: string
}

export type AgentRuntimeValidationCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'message_required'
  | 'message_too_long'
  | 'invalid_surface'
  | 'invalid_refs'
  | 'invalid_capability'

export class AgentRuntimeValidationError extends Error {
  readonly code: AgentRuntimeValidationCode

  constructor(code: AgentRuntimeValidationCode) {
    super(code)
    this.name = 'AgentRuntimeValidationError'
    this.code = code
  }
}

const SURFACES = new Set<AgentSurface>(['today', 'learning', 'library', 'agent'])
const CAPABILITIES = new Set<CapabilityId>(['free_chat', 'guided_learning'])
const REF_KEYS = ['bookId', 'chapterId', 'blockId', 'conceptId', 'documentId'] as const
const MAX_MESSAGE_CHARACTERS = 2_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRef(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new AgentRuntimeValidationError('invalid_refs')
  const normalized = value.trim()
  if (!normalized) throw new AgentRuntimeValidationError('invalid_refs')
  return normalized
}

function normalizeRefs(value: unknown): AgentObjectRefs {
  if (!isRecord(value)) throw new AgentRuntimeValidationError('invalid_refs')
  const refs: AgentObjectRefs = {}
  for (const key of REF_KEYS) {
    const normalized = normalizeRef(value[key])
    if (normalized !== undefined) refs[key] = normalized
  }
  if (refs.chapterId !== undefined && refs.bookId === undefined) {
    throw new AgentRuntimeValidationError('invalid_refs')
  }
  if (refs.blockId !== undefined && refs.chapterId === undefined) {
    throw new AgentRuntimeValidationError('invalid_refs')
  }
  if (refs.conceptId !== undefined && refs.bookId === undefined) {
    throw new AgentRuntimeValidationError('invalid_refs')
  }
  return refs
}

export function normalizeStartTurnRequest(value: unknown): StartTurnRequestV1 {
  if (!isRecord(value)) throw new AgentRuntimeValidationError('invalid_request')
  if (value.version !== '1') throw new AgentRuntimeValidationError('unsupported_version')
  if (typeof value.message !== 'string') {
    throw new AgentRuntimeValidationError('message_required')
  }
  const message = value.message.replace(/\s+/gu, ' ').trim()
  if (!message) throw new AgentRuntimeValidationError('message_required')
  if (message.length > MAX_MESSAGE_CHARACTERS) {
    throw new AgentRuntimeValidationError('message_too_long')
  }
  if (typeof value.surface !== 'string' || !SURFACES.has(value.surface as AgentSurface)) {
    throw new AgentRuntimeValidationError('invalid_surface')
  }
  if (
    value.capabilityHint !== undefined &&
    (typeof value.capabilityHint !== 'string' ||
      !CAPABILITIES.has(value.capabilityHint as CapabilityId))
  ) {
    throw new AgentRuntimeValidationError('invalid_capability')
  }

  return {
    version: '1',
    message,
    surface: value.surface as AgentSurface,
    refs: normalizeRefs(value.refs),
    ...(value.capabilityHint === undefined
      ? {}
      : { capabilityHint: value.capabilityHint as CapabilityId }),
  }
}
