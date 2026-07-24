interface SceneCaptionProps {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  y?: number;
}

export const SceneCaption = ({
  title,
  subtitle,
  align = 'left',
  y = 520,
}: SceneCaptionProps) => {
  const isLeft = align === 'left';

  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: isLeft ? 120 : undefined,
        right: isLeft ? undefined : 120,
        width: isLeft ? 640 : undefined,
        textAlign: align,
        color: '#1c1c1e',
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 40,
          fontWeight: 650,
          letterSpacing: '-0.03em',
          lineHeight: 1.15,
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p
          style={{
            margin: '14px 0 0',
            fontSize: 20,
            color: 'rgba(28,28,30,0.52)',
            lineHeight: 1.5,
            letterSpacing: '0.01em',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};
