import { DataMode } from '../../network/ServerConfig'
import { AgentCitation, AgentEventEnvelopeV1, AgentQuestion } from './AgentEventParser'
import { AgentEventListener, AgentRuntimeGateway, AgentTurnRequest } from './AgentRuntimeGateway'

function started(turnId: string): AgentEventEnvelopeV1 {
  return new AgentEventEnvelopeV1(turnId, '1', 'turn_started')
}

function fixtureEvents(turnId: string): Array<AgentEventEnvelopeV1> {
  const activity = new AgentEventEnvelopeV1(turnId, '2', 'activity')
  activity.activityLabel = '正在核对章节依据'
  const delta = new AgentEventEnvelopeV1(turnId, '3', 'content_delta')
  delta.text = '先判断训练数据中是否存在目标标签。'
  const question = new AgentEventEnvelopeV1(turnId, '4', 'user_question')
  question.question = new AgentQuestion(`${turnId}:clarify`, '训练数据里有预先给出的目标标签吗？',
    ['有目标标签', '没有目标标签'], true)
  return [started(turnId), activity, delta, question]
}

export class FixtureAgentRuntimeGateway implements AgentRuntimeGateway {
  readonly mode: DataMode = DataMode.FIXTURE
  private readonly turnId: string = 'turn-arkui-fixture'

  start(_request: AgentTurnRequest, listener: AgentEventListener): Promise<void> {
    const events: Array<AgentEventEnvelopeV1> = fixtureEvents(this.turnId)
    for (let index: number = 0; index < events.length; index++) listener(events[index])
    return Promise.resolve()
  }

  reconnect(_turnId: string, _lastEventId: string, _listener: AgentEventListener): Promise<void> {
    return Promise.resolve()
  }

  answer(turnId: string, _questionId: string, answer: string,
    listener: AgentEventListener): Promise<void> {
    const activity = new AgentEventEnvelopeV1(turnId, '5', 'activity')
    activity.activityLabel = '正在继续学习'
    listener(activity)
    const delta = new AgentEventEnvelopeV1(turnId, '6', 'content_delta')
    delta.text = ` 你的回答是“${answer}”。判断监督学习的关键正是监督信号；你也可以在本章的费曼复述面板用自己的话讲一遍。`
    listener(delta)
    const citation = new AgentEventEnvelopeV1(turnId, '7', 'citation')
    citation.citation = new AgentCitation('S1', '当前互动学习书', '本章')
    listener(citation)
    listener(new AgentEventEnvelopeV1(turnId, '8', 'turn_completed'))
    return Promise.resolve()
  }

  cancel(_turnId: string): Promise<void> {
    return Promise.resolve()
  }
}
