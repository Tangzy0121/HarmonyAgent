import type { ToolDefinition } from '../toolRegistry.js'

interface AskUserResult {
  prompt: string
  options: string[]
  allowFreeText: boolean
}

function normalize(input: unknown): AskUserResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('invalid_tool_input')
  }
  const record = input as Record<string, unknown>
  if (typeof record.prompt !== 'string' || !record.prompt.trim()) {
    throw new Error('invalid_tool_input')
  }
  if (!Array.isArray(record.options) || record.options.some((value) =>
    typeof value !== 'string' || !value.trim())) {
    throw new Error('invalid_tool_input')
  }
  if (typeof record.allowFreeText !== 'boolean') throw new Error('invalid_tool_input')
  return {
    prompt: record.prompt.trim(),
    options: record.options.map((value) => (value as string).trim()),
    allowFreeText: record.allowFreeText,
  }
}

export const askUserTool: ToolDefinition<unknown, AskUserResult> = {
  id: 'ask_user',
  access: 'write',
  async execute(input) {
    return normalize(input)
  },
}
