import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { ProductScreen } from '../components/ProductScreen';
import { TapIndicator } from '../components/TapIndicator';
import { SceneCaption } from '../components/SceneCaption';
import { ScenePhone, type PhonePlacement } from '../components/ScenePhone';

const start: PhonePlacement = { x: 1010, y: 70, scale: 1.05 };
const focus: PhonePlacement = { x: 930, y: 38, scale: 1.12 };

export const LibraryScene = () => {
  const frame = useCurrentFrame();

  const phoneX = interpolate(frame, [132, 220], [start.x, focus.x], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const phoneY = interpolate(frame, [132, 220], [start.y, focus.y], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const phoneScale = interpolate(frame, [132, 220], [start.scale, focus.scale], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const todayOpacity = interpolate(frame, [0, 12], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const libraryIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const libraryEnterY = interpolate(frame, [0, 18], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const filePush = interpolate(frame, [136, 160], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  const libraryShiftX = interpolate(filePush, [0, 1], [0, -38]);
  const libraryScale = interpolate(filePush, [0, 1], [1, 0.985]);
  const fileTranslateX = interpolate(filePush, [0, 1], [390, 0]);
  const fileEdgeShadow = interpolate(filePush, [0, 0.12, 0.82, 1], [0, 0.18, 0.12, 0]);

  const captionOpacity = interpolate(frame, [30, 64], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const captionFade = interpolate(frame, [124, 154], [1, 0], {
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
          top: 460,
          width: 560,
          opacity: captionOpacity * captionFade,
          pointerEvents: 'none',
        }}
      >
        <SceneCaption title="资料进入知识库" subtitle="自动理解结构" y={0} />
      </div>

      <ScenePhone placement={{ x: phoneX, y: phoneY, scale: phoneScale }}>
        <div style={{ position: 'absolute', inset: 0, opacity: todayOpacity }}>
          <ProductScreen src="captures/today-default.png" />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: libraryIn,
            transform: `translate3d(${libraryShiftX}px, ${libraryEnterY}px, 0) scale(${libraryScale})`,
            transformOrigin: 'center center',
          }}
        >
          <ProductScreen src="captures/library-default.png" />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate3d(${fileTranslateX}px, 0, 0)`,
            boxShadow: `-18px 0 36px rgba(12, 12, 14, ${fileEdgeShadow})`,
            background: '#f6f6f8',
          }}
        >
          <ProductScreen src="captures/file-understanding.png" />
        </div>
        <TapIndicator x={195} y={220} start={116} end={140} />
        <TapIndicator x={281} y={799} start={260} end={286} />
      </ScenePhone>
    </AbsoluteFill>
  );
};
