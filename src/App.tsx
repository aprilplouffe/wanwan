import React, { useEffect, useState } from 'react';

declare global {
  interface Window {
    db: any;
    startWanWanApp?: () => Promise<void>;
    toast?: (msg: string, type?: string) => void;
  }
}

export const App: React.FC = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return null;
};
