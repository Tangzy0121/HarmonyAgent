import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { ProductScreen } from '../components/ProductScreen';
import { TapIndicator } from '../components/TapIndicator';
import { SceneCaption } from '../components/SceneCaption';
import { ScenePhone } from '../components/ScenePhone';

export const LearningMapScene = () => {
  const frame = useCurrentFrame();

  const outcomeOpacity = interpolate(frame, [0, 12], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const mapOpacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const mapEnterY = interpolate(frame, [0, 18], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const focusIn = interpolate(frame, [104, 118], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const focusOut = interpolate(frame, [202, 216], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const focusOpacity = Math.min(focusIn, focusOut);

  const captionIn = interpolate(frame, [24, 54], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const captionOut = interpolate(frame, [214, 244], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 450,
          width: 580,
          opacity: captionIn * captionOut,
          pointerEvents: 'none',
        }}
      >
        <SceneCaption title="知识路径" subtitle="学习证据已经附着到节点" y={0} />
      </div>

      <ScenePhone>
        <div style={{ position: 'absolute', inset: 0, opacity: outcomeOpacity }}>
          <ProductScreen src="captures/today-outcome.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: mapOpacity,
            transform: `translate3d(0, ${mapEnterY}px, 0)`,
          }}
        >
          <ProductScreen src="captures/learning-map-default.png" />
        </div>

        <div style={{ position: 'absolute', inset: 0, opacity: focusOpacity }}>
          <ProductScreen src="captures/learning-map-node-focus.png" />
        </div>

        <TapIndicator x={209} y={337} start={84} end={110} />
        <TapIndicator x={321} y={322} start={188} end={212} />
        <TapIndicator x={342} y={800} start={238} end={264} />
      </ScenePhone>
    </AbsoluteFill>
  );
};
