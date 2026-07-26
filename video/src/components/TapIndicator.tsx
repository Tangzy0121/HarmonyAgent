import { Easing, interpolate, useCurrentFrame } from 'remotion';

interface TapIndicatorProps {
  x: number;
  y: number;
  start: number;
  end: number;
}

export const TapIndicator = ({ x, y, start, end }: TapIndicatorProps) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const activeOpacity = interpolate(
    frame,
    [start - 4, start, start + 7, end],
    [0, 0.62, 0.42, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    },
  );

  const press = interpolate(frame, [start - 5, start, start + 5], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const radius = 14 + progress * 20;
  const opacity = activeOpacity * (1 - progress * 0.45);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 0,
        height: 0,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.82)',
          background: 'rgba(255,255,255,0.10)',
          transform: 'translate(-50%, -50%)',
          opacity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.94)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.22)',
          transform: `translate(-50%, -50%) scale(${0.72 + press * 0.28})`,
          opacity: press,
        }}
      />
    </div>
  );
};
