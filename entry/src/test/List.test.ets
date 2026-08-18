import learningSessionTest from './LearningSession.test'
import fixtureLearningRepositoryTest from './FixtureLearningRepository.test'
import sseFrameParserTest from './SseFrameParser.test'
import fixtureBookAgentGatewayTest from './FixtureBookAgentGateway.test'
import contractParsingTest from './ContractParsing.test'
import agentEventParserTest from './AgentEventParser.test'
import agentTurnSessionTest from './AgentTurnSession.test'
import agentDrawerStateTest from './AgentDrawerState.test'
import feynmanSessionTest from './FeynmanSession.test'
import agentByteStreamTest from './AgentByteStream.test'
import feynmanPanelStateTest from './FeynmanPanelState.test'
import voiceSessionTest from './VoiceSession.test'
import reviewReminderTest from './ReviewReminder.test'
import reviewDeepLinkTest from './ReviewDeepLink.test'

export default function testsuite(): void {
  learningSessionTest()
  fixtureLearningRepositoryTest()
  sseFrameParserTest()
  fixtureBookAgentGatewayTest()
  contractParsingTest()
  agentEventParserTest()
  agentTurnSessionTest()
  agentDrawerStateTest()
  feynmanSessionTest()
  agentByteStreamTest()
  feynmanPanelStateTest()
  voiceSessionTest()
  reviewReminderTest()
  reviewDeepLinkTest()
}
