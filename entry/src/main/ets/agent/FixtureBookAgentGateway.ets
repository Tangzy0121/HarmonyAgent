import { BookAgentGateway } from './BookAgentGateway'
import { BookAgentEvent } from './BookAgentModels'

export class FixtureBookAgentGateway implements BookAgentGateway {
  stream(question: string, contextText: string,
    onEvent: (event: BookAgentEvent) => void): Promise<void> {
    onEvent(new BookAgentEvent('start'))
    onEvent(new BookAgentEvent('delta',
      '先别急着记答案。你能指出题目中的训练数据有没有目标标签吗？这正是判断监督学习的关键。'))
    onEvent(new BookAgentEvent('done'))
    return Promise.resolve()
  }
}
