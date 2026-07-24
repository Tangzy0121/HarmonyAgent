import { useCurrentFrame, interpolate, Easing } from 'remotion';

export type EaseName = 'linear' | 'easeInOut' | 'easeOut' | 'easeIn';

const easeMap: Record<EaseName, (t: number) => number> = {
  linear: Easing.linear,
  easeInOut: Easing.bezier(0.45, 0, 0.55, 1),
  easeOut: Easing.bezier(0.16, 1, 0.3, 1),
  easeIn: Easing.bezier(0.4, 0, 1, 1),
};

interface TransformState {
  x: number;
  y: number;
  scale: number;
}

interface CameraMoveProps {
  from: number;
  to: number;
  start: TransformState;
  end: TransformState;
  origin?: { x: number; y: number };
  ease?: EaseName;
  children: React.ReactNode;
}

export const CameraMove = ({
  from,
  to,
  start,
  end,
  origin = { x: 195, y: 422 },
  ease = 'easeInOut',
  children,
}: CameraMoveProps) => {
  const frame = useCurrentFrame();

  const x = interpolate(frame, [from, to], [start.x, end.x], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeMap[ease],
  });
  const y = interpolate(frame, [from, to], [start.y, end.y], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeMap[ease],
  });
  const scale = interpolate(frame, [from, to], [start.scale, end.scale], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeMap[ease],
  });

  return (
    <div
      style={{
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        transformOrigin: `${origin.x}px ${origin.y}px`,
      }}
    >
      {children}
    </div>
  );
};
