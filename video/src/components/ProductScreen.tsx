import { Img, staticFile } from 'remotion';

interface ProductScreenProps {
  src: string;
  transform?: string;
}

export const ProductScreen = ({ src, transform }: ProductScreenProps) => {
  return (
    <div
      style={{
        width: 390,
        height: 844,
        transform,
        transformOrigin: 'top left',
      }}
    >
      <Img
        src={staticFile(src)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};
