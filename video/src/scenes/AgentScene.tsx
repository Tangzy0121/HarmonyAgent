import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { ProductScreen } from '../components/ProductScreen';
import { TapIndicator } from '../components/TapIndicator';
import { SceneCaption } from '../components/SceneCaption';
import { ScenePhone } from '../components/ScenePhone';

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

export const AgentScene = () => {
  const frame = useCurrentFrame();

  const agentIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const agentEnterY = interpolate(frame, [0, 22], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const fullPush = interpolate(frame, [72, 96], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const fullY = interpolate(fullPush, [0, 1], [844, 0]);

  const captionIn = interpolate(frame, [26, 56], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const captionOut = interpolate(frame, [142, 174], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const sceneExit = interpolate(frame, [150, 180], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: sceneExit }}>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 450,
          width: 600,
          opacity: captionIn * captionOut,
          pointerEvents: 'none',
        }}
      >
        <SceneCaption title="基于当前上下文" subtitle="继续向 Agent 提问" y={0} />
      </div>

      <ScenePhone>
        <div style={{ position: 'absolute', inset: 0 }}>
          <ProductScreen src="captures/learning-map-default.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: agentIn,
            transform: `translate3d(0, ${agentEnterY}px, 0)`,
          }}
        >
          <ProductScreen src="captures/agent-default.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate3d(0, ${fullY}px, 0)`,
            background: '#fff',
            boxShadow: `0 -18px 36px rgba(12, 12, 14, ${interpolate(
              fullPush,
              [0, 0.15, 0.85, 1],
              [0, 0.14, 0.08, 0]
            )})`,
          }}
        >
          <ProductScreen src="captures/agent-full.png" />
        </div>

        <TapIndicator x={32} y={246} start={58} end={82} />
      </ScenePhone>
    </AbsoluteFill>
  );
};
