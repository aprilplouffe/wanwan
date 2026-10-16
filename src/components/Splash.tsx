import React, { useState } from 'react';

interface SplashProps {
  onStart: () => void;
}

export const Splash: React.FC<SplashProps> = ({ onStart }) => {
  const [isStarting, setIsStarting] = useState(false);
  const [hidden, setHidden] = useState(false);

  const handleClick = () => {
    if (isStarting) return;
    setIsStarting(true);
    setTimeout(() => {
      setHidden(true);
      onStart();
    }, 450);
  };

  if (hidden) return null;

  return (
    <div
      id="loading"
      className={isStarting ? 'hidden' : ''}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="splash-bg">
        <div className="splash-blob b1"></div>
        <div className="splash-blob b2"></div>
        <div className="splash-blob b3"></div>
        <div className="splash-ring r1"></div>
        <div className="splash-ring r2"></div>
        <div className="splash-ring r3"></div>
      </div>
      <div className="splash-center">
        <div className="splash-icon">
          <img src="img/wanwan.png" alt="弯弯" />
        </div>
        <div className="splash-title">弯弯</div>
        <div className="splash-tagline">ワンワン</div>
      </div>
      <div className="splash-tap ready" id="splash-tap">
        <div className="tap-line"></div>
        <span>{isStarting ? 'Starting...' : 'Tap to Start'}</span>
        <div className="tap-line"></div>
      </div>
    </div>
  );
};
