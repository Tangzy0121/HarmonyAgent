import type { ToolDefinition } from '../toolRegistry.js'

export const readLearningStateTool: ToolDefinition = {
  id: 'read_learning_state',
  access: 'read',
  async execute(_input, context) {
    return { ...context.learningStateSummary }
  },
}
