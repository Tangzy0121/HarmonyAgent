import sseFrameParserTest from './SseFrameParser.test'
import fixtureBookAgentGatewayTest from './FixtureBookAgentGateway.test'
import agentEventParserTest from './AgentEventParser.test'
import agentByteStreamTest from './AgentByteStream.test'
import voiceSessionTest from './VoiceSession.test'
import reviewReminderTest from './ReviewReminder.test'
import reviewDeepLinkTest from './ReviewDeepLink.test'

export default function testsuite(): void {
  sseFrameParserTest()
  fixtureBookAgentGatewayTest()
  agentEventParserTest()
  agentByteStreamTest()
  voiceSessionTest()
  reviewReminderTest()
  reviewDeepLinkTest()
}
