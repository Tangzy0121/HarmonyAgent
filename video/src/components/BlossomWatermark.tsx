import { BlossomMark } from './BlossomMark';

interface BlossomWatermarkProps {
  x?: number;
  y?: number;
  size?: number;
  opacity?: number;
}

export const BlossomWatermark = ({
  x: _x,
  y: _y,
  size: _size,
  opacity: _opacity,
}: BlossomWatermarkProps) => {
  const x = 1240;
  const y = 250;
  const size = 1280;
  const opacity = 0.028;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity,
        pointerEvents: 'none',
        filter: 'blur(1px)',
        transform: 'rotate(-10deg)',
        transformOrigin: 'center',
      }}
    >
      <BlossomMark size={size} color="#1c1c1e" />
    </div>
  );
};
