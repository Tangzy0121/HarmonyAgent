interface BlossomMarkProps {
  size?: number;
  color?: string;
}

export const BlossomMark = ({ size = 96, color = '#1c1c1e' }: BlossomMarkProps) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" />
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" transform="rotate(72 12 12)" />
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" transform="rotate(144 12 12)" />
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" transform="rotate(216 12 12)" />
      <path d="M12 12c-1.2-1.8-2.6-3.6-2.9-5.8C8.7 3.7 9.9 1.8 12 1.8s3.3 1.9 2.9 4.4C14.6 8.4 13.2 10.2 12 12Z" transform="rotate(288 12 12)" />
      <circle cx={12} cy={12} r={1.35} />
    </svg>
  );
};
