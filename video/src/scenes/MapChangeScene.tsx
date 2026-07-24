import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { ProductScreen } from '../components/ProductScreen';
import { TapIndicator } from '../components/TapIndicator';
import { SceneCaption } from '../components/SceneCaption';
import { ScenePhone } from '../components/ScenePhone';

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

const progress = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });

export const MapChangeScene = () => {
  const frame = useCurrentFrame();

  const mapPush = progress(frame, 0, 26);
  const outcomePush = progress(frame, 146, 172);
  const mapX =
    interpolate(mapPush, [0, 1], [390, 0]) +
    interpolate(outcomePush, [0, 1], [0, -38]);
  const outcomeX = interpolate(outcomePush, [0, 1], [390, 0]);

  const firstCaptionIn = interpolate(frame, [28, 56], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const firstCaptionOut = interpolate(frame, [126, 154], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const secondCaptionIn = interpolate(frame, [176, 206], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const secondCaptionOut = interpolate(frame, [258, 288], [1, 0], {
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
          width: 600,
          opacity: firstCaptionIn * firstCaptionOut,
          pointerEvents: 'none',
        }}
      >
        <SceneCaption title="学习结果更新地图" subtitle="证据回到知识结构" y={0} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 450,
          width: 600,
          opacity: secondCaptionIn * secondCaptionOut,
          pointerEvents: 'none',
        }}
      >
        <SceneCaption title="安排下一次学习" subtitle="让知识持续生长" y={0} />
      </div>

      <ScenePhone>
        <div style={{ position: 'absolute', inset: 0 }}>
          <ProductScreen src="captures/learning-completion.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate3d(${mapX}px, 0, 0)`,
            background: '#fff',
          }}
        >
          <ProductScreen src="captures/map-change-focus.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate3d(${outcomeX}px, 0, 0)`,
            background: '#f6f6f8',
            boxShadow: `-18px 0 36px rgba(12, 12, 14, ${interpolate(
              outcomePush,
              [0, 0.15, 0.85, 1],
              [0, 0.14, 0.08, 0]
            )})`,
          }}
        >
          <ProductScreen src="captures/today-outcome.png" />
        </div>

        <TapIndicator x={300} y={800} start={122} end={150} />
        <TapIndicator x={163} y={800} start={260} end={286} />
      </ScenePhone>
    </AbsoluteFill>
  );
};
