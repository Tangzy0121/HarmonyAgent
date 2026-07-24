import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

export const useWaitForFonts = () => {
  const [handle] = useState(() => delayRender('waiting-for-fonts'));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.fonts.ready.then(() => continueRender(handle));
  }, [handle]);
};
