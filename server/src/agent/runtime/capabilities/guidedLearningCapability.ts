import type { BookAgentRunner } from '../bookAgentRunner.js'
import { FreeChatCapability } from './freeChatCapability.js'

export class GuidedLearningCapability extends FreeChatCapability {
  constructor(runner: BookAgentRunner) {
    super(runner)
  }
}
