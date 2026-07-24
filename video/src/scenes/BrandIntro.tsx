import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { BlossomMark } from '../components/BlossomMark';

export const BrandIntro = () => {
  const frame = useCurrentFrame();

  const blossomOpacity = interpolate(frame, [0, 32], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const blossomScale = interpolate(frame, [0, 50, 105, 145], [0.92, 1, 1, 0.94], {
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const blossomY = interpolate(frame, [0, 50, 105, 145], [12, 0, 0, -18], {
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  const textOpacity = interpolate(frame, [32, 72, 100, 132], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const textY = interpolate(frame, [32, 72, 100, 132], [12, 0, 0, -10], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  const outOpacity = interpolate(frame, [108, 148], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const exitX = interpolate(frame, [94, 148], [0, -260], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const exitScale = interpolate(frame, [94, 148], [1, 0.92], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: outOpacity,
        transform: `translateX(${exitX}px) scale(${exitScale})`,
      }}
    >
      <div
        style={{
          opacity: blossomOpacity,
          transform: `translateY(${blossomY}px) scale(${blossomScale})`,
          marginBottom: 32,
          filter: 'drop-shadow(0 24px 48px rgba(0,0,0,0.10))',
        }}
      >
        <BlossomMark size={128} color="#1c1c1e" />
      </div>

      <div
        style={{
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          loci
        </h1>
        <p
          style={{
            margin: '20px 0 0',
            fontSize: 22,
            color: 'rgba(28,28,30,0.52)',
            maxWidth: 520,
            lineHeight: 1.55,
          }}
        >
          资料经过理解、验证与关联，成为可继续学习的知识路径
        </p>
      </div>
    </AbsoluteFill>
  );
};
