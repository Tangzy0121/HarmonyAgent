import { AbsoluteFill, Sequence } from 'remotion';
import { timeline } from './timeline';
import { useWaitForFonts } from './hooks/useWaitForFonts';
import { BrandIntro } from './scenes/BrandIntro';
import { TodayScene } from './scenes/TodayScene';
import { LibraryScene } from './scenes/LibraryScene';
import { LearningFlowScene } from './scenes/LearningFlowScene';
import { MapChangeScene } from './scenes/MapChangeScene';
import { LearningMapScene } from './scenes/LearningMapScene';
import { AgentScene } from './scenes/AgentScene';
import { BrandOutro } from './scenes/BrandOutro';
import { BlossomWatermark } from './components/BlossomWatermark';

export const LociDemo = () => {
  useWaitForFonts();

  return (
    <AbsoluteFill className="loci-canvas">
      <BlossomWatermark />
      <Sequence from={timeline.brandIntro.start} durationInFrames={timeline.brandIntro.duration}>
        <BrandIntro />
      </Sequence>
      <Sequence from={timeline.todayScene.start} durationInFrames={timeline.todayScene.duration}>
        <TodayScene />
      </Sequence>
      <Sequence from={timeline.libraryScene.start} durationInFrames={timeline.libraryScene.duration}>
        <LibraryScene />
      </Sequence>
      <Sequence from={timeline.learningFlowScene.start} durationInFrames={timeline.learningFlowScene.duration}>
        <LearningFlowScene />
      </Sequence>
      <Sequence from={timeline.mapChangeScene.start} durationInFrames={timeline.mapChangeScene.duration}>
        <MapChangeScene />
      </Sequence>
      <Sequence from={timeline.learningMapScene.start} durationInFrames={timeline.learningMapScene.duration}>
        <LearningMapScene />
      </Sequence>
      <Sequence from={timeline.agentScene.start} durationInFrames={timeline.agentScene.duration}>
        <AgentScene />
      </Sequence>
      <Sequence from={timeline.brandOutro.start} durationInFrames={timeline.brandOutro.duration}>
        <BrandOutro />
      </Sequence>
    </AbsoluteFill>
  );
};
