import { Composition } from 'remotion';
import { LociDemo } from './LociDemo';

export const Root = () => {
  return (
    <Composition
      id="LociDemo"
      component={LociDemo}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={1890}
      defaultProps={{}}
    />
  );
};
