export const PhoneFrame = ({ children }: { children: React.ReactNode }) => {
  const screenWidth = 390;
  const screenHeight = 844;
  const bezel = 12;

  return (
    <div
      style={{
        width: screenWidth,
        height: screenHeight,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -bezel,
          borderRadius: 48,
          background: '#111112',
          boxShadow: `
            0 24px 64px rgba(0,0,0,0.28),
            0 8px 20px rgba(0,0,0,0.16),
            inset 0 1px 0 rgba(255,255,255,0.12)
          `,
          zIndex: 0,
        }}
      />
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 36,
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
          background: '#000',
        }}
      >
        {children}
      </div>
    </div>
  );
};
