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

export const LearningFlowScene = () => {
  const frame = useCurrentFrame();

  const explanationPush = progress(frame, 0, 26);
  const verificationPush = progress(frame, 106, 132);
  const selectedOpacity = interpolate(frame, [176, 184], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const feedbackPush = progress(frame, 230, 250);
  const feedbackExitX = interpolate(feedbackPush, [0, 1], [0, -38]);
  const completionPush = progress(frame, 302, 328);

  const phoneX = interpolate(
    frame,
    [0, 106, 132, 230, 250, 360],
    [930, 930, 720, 720, 1000, 1000],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: easeOut,
    }
  );
  const phoneY = interpolate(
    frame,
    [0, 106, 132, 230, 250, 360],
    [38, 38, 52, 52, 62, 62],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: easeOut,
    }
  );
  const phoneScale = interpolate(
    frame,
    [0, 106, 132, 230, 250, 360],
    [1.12, 1.12, 1.14, 1.14, 1.02, 1.02],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: easeOut,
    }
  );

  const firstCaptionIn = interpolate(frame, [24, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const firstCaptionOut = interpolate(frame, [96, 122], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const evidenceCaptionIn = interpolate(frame, [248, 278], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const evidenceCaptionOut = interpolate(frame, [338, 360], [1, 0.72], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 450,
          width: 580,
          opacity: firstCaptionIn * firstCaptionOut,
          pointerEvents: 'none',
        }}
      >
        <SceneCaption
          title={'\u7406\u89e3 \u00b7 \u9a8c\u8bc1 \u00b7 \u5b8c\u6210'}
          subtitle={'\u5728\u4e00\u6b21\u5224\u65ad\u4e2d\u5de9\u56fa\u77e5\u8bc6'}
          y={0}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 450,
          width: 620,
          opacity: evidenceCaptionIn * evidenceCaptionOut,
          pointerEvents: 'none',
        }}
      >
        <SceneCaption
          title={'\u6bcf\u6b21\u5224\u65ad\uff0c\u90fd\u6c89\u6dc0\u4e3a\u8bc1\u636e'}
          subtitle={'\u5b66\u4e60\u7ed3\u679c\u81ea\u52a8\u56de\u5230\u77e5\u8bc6\u7ed3\u6784'}
          y={0}
        />
      </div>

      <ScenePhone placement={{ x: phoneX, y: phoneY, scale: phoneScale }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <ProductScreen src="captures/file-understanding.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate3d(${interpolate(explanationPush, [0, 1], [390, 0])}px, 0, 0)`,
            background: '#fff',
            boxShadow: `-18px 0 36px rgba(12, 12, 14, ${interpolate(
              explanationPush,
              [0, 0.15, 0.85, 1],
              [0, 0.16, 0.1, 0]
            )})`,
          }}
        >
          <ProductScreen src="captures/learning-explanation.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate3d(${
              interpolate(verificationPush, [0, 1], [390, 0]) + feedbackExitX
            }px, 0, 0)`,
            background: '#fff',
            boxShadow: `-18px 0 36px rgba(12, 12, 14, ${interpolate(
              verificationPush,
              [0, 0.15, 0.85, 1],
              [0, 0.16, 0.1, 0]
            )})`,
          }}
        >
          <ProductScreen src="captures/verification-default.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: selectedOpacity,
            transform: `translate3d(${feedbackExitX}px, 0, 0)`,
          }}
        >
          <ProductScreen src="captures/verification-selected.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate3d(${interpolate(feedbackPush, [0, 1], [390, 0])}px, 0, 0)`,
            background: '#fff',
            boxShadow: `-18px 0 36px rgba(12, 12, 14, ${interpolate(
              feedbackPush,
              [0, 0.15, 0.85, 1],
              [0, 0.14, 0.08, 0]
            )})`,
          }}
        >
          <ProductScreen src="captures/verification-feedback.png" />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate3d(${interpolate(completionPush, [0, 1], [390, 0])}px, 0, 0)`,
            background: '#fff',
            boxShadow: `-18px 0 36px rgba(12, 12, 14, ${interpolate(
              completionPush,
              [0, 0.15, 0.85, 1],
              [0, 0.16, 0.1, 0]
            )})`,
          }}
        >
          <ProductScreen src="captures/learning-completion.png" />
        </div>

        <TapIndicator x={281} y={799} start={88} end={114} />
        <TapIndicator x={195} y={600} start={164} end={188} />
        <TapIndicator x={281} y={799} start={208} end={234} />
        <TapIndicator x={281} y={799} start={284} end={310} />
        <TapIndicator x={300} y={790} start={334} end={358} />
      </ScenePhone>
    </AbsoluteFill>
  );
};
