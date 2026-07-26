import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { BlossomMark } from '../components/BlossomMark';

export const BrandOutro = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [12, 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div style={{ marginBottom: 32, filter: 'drop-shadow(0 24px 48px rgba(0,0,0,0.10))' }}>
        <BlossomMark size={128} color="#1c1c1e" />
      </div>
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
          textAlign: 'center',
          lineHeight: 1.55,
        }}
      >
        让资料成为知识路径
      </p>
    </AbsoluteFill>
  );
};
