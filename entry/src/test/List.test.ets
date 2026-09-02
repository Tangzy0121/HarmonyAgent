import sseFrameParserTest from './SseFrameParser.test'
import fixtureBookAgentGatewayTest from './FixtureBookAgentGateway.test'
import agentEventParserTest from './AgentEventParser.test'
import agentByteStreamTest from './AgentByteStream.test'
import voiceSessionTest from './VoiceSession.test'
import reviewReminderTest from './ReviewReminder.test'
import reviewDeepLinkTest from './ReviewDeepLink.test'
import lociSseFrameParserTest from './LociSseFrameParser.test'
import workspaceProjectStateTest from './WorkspaceProjectState.test'
import fixtureReviewMapperTest from './FixtureReviewMapper.test'

export default function testsuite(): void {
  sseFrameParserTest()
  fixtureBookAgentGatewayTest()
  agentEventParserTest()
  agentByteStreamTest()
  voiceSessionTest()
  reviewReminderTest()
  reviewDeepLinkTest()
  lociSseFrameParserTest()
  workspaceProjectStateTest()
  fixtureReviewMapperTest()
}
