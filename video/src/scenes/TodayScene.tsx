import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ProductScreen } from '../components/ProductScreen';
import { TapIndicator } from '../components/TapIndicator';
import { SceneCaption } from '../components/SceneCaption';
import {
  ScenePhone,
  type PhonePlacement,
} from '../components/ScenePhone';

const startPlacement: PhonePlacement = { x: 1110, y: 90, scale: 0.98 };
const focusPlacement: PhonePlacement = { x: 1010, y: 70, scale: 1.05 };

export const TodayScene = () => {
  const frame = useCurrentFrame();

  const phoneOpacity = interpolate(frame, [4, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const captionOpacity = interpolate(frame, [66, 102], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const captionFade = interpolate(frame, [188, 226], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

  const phoneX = interpolate(
    frame,
    [0, 170],
    [1450, focusPlacement.x],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );
  const phoneY = interpolate(
    frame,
    [0, 170],
    [startPlacement.y + 18, focusPlacement.y],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );
  const phoneScale = interpolate(
    frame,
    [0, 170],
    [0.94, focusPlacement.scale],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 460,
          width: 560,
          opacity: captionOpacity * captionFade,
          pointerEvents: 'none',
        }}
      >
        <SceneCaption title="今日重点" subtitle="从最重要的学习开始" y={0} />
      </div>

      <ScenePhone
        placement={{ x: phoneX, y: phoneY, scale: phoneScale }}
        opacity={phoneOpacity}
      >
        <ProductScreen src="captures/today-default.png" />
        <TapIndicator x={325} y={817} start={236} end={258} />
      </ScenePhone>
    </AbsoluteFill>
  );
};
