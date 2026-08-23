import type { ToolDefinition } from '../toolRegistry.js'

function sourceIdFrom(input: unknown): string {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('invalid_tool_input')
  }
  const sourceId = (input as Record<string, unknown>).sourceId
  if (typeof sourceId !== 'string' || !sourceId.trim()) throw new Error('invalid_tool_input')
  return sourceId.trim()
}

export const readSourceTool: ToolDefinition = {
  id: 'read_source',
  access: 'read',
  async execute(input, context) {
    const sourceId = sourceIdFrom(input)
    const source = context.sources.find((candidate) => candidate.sourceId === sourceId)
    if (!source || !context.readScope.sourceIds.includes(sourceId)) {
      throw new Error('source_not_allowed')
    }
    return { ...source }
  },
}
