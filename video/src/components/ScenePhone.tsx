import { PhoneFrame } from './PhoneFrame';

export interface PhonePlacement {
  scale: number;
  x: number;
  y: number;
}

interface ScenePhoneProps {
  children: React.ReactNode;
  placement?: PhonePlacement;
  opacity?: number;
}

export const PHONE_SCALE = 0.98;
export const PHONE_OUTER_WIDTH = 414 * PHONE_SCALE;
export const PHONE_OUTER_HEIGHT = 868 * PHONE_SCALE;

// Every scene shares one locked product stage. Motion belongs inside the screen,
// while the left side remains reserved for narration.
export const LOCKED_PHONE_PLACEMENT: PhonePlacement = {
  scale: 1.12,
  x: 930,
  y: 38,
};
export const DEFAULT_PHONE_PLACEMENT = LOCKED_PHONE_PLACEMENT;

export const ScenePhone = ({
  children,
  opacity = 1,
}: ScenePhoneProps) => {
  const placement = LOCKED_PHONE_PLACEMENT;

  return (
    <div
      style={{
        position: 'absolute',
        left: placement.x,
        top: placement.y,
        transform: `scale(${placement.scale})`,
        transformOrigin: 'top left',
        opacity,
        filter: `
          drop-shadow(0 48px 96px rgba(0, 0, 0, 0.22))
          drop-shadow(0 16px 32px rgba(0, 0, 0, 0.12))
        `,
      }}
    >
      <PhoneFrame>{children}</PhoneFrame>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 868,
          width: 414,
          height: 120,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0) 80%)',
          transform: 'scaleY(-0.35)',
          transformOrigin: 'top',
          filter: 'blur(18px)',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
