import { useEffect, useState } from 'react';

interface Props {
  onFinish?: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 850);

    const removeTimer = setTimeout(() => {
      setHidden(true);
      onFinish?.();
    }, 1150);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [onFinish]);

  if (hidden) return null;

  return (
    <div className={`splash-screen ${fading ? 'splash-fade' : ''}`}>
      <div className="splash-center">
        <div className="splash-logo-wrap">
          <div className="splash-emblem">CV</div>
        </div>
        <h1 className="splash-title">CLEARVOICE</h1>
        <p className="splash-subtitle">Real-Time Adaptive Noise Suppression &amp; P2P Messaging</p>
      </div>

      <div className="splash-footer">
        <div className="splash-p2p-badge">
          <span>⚡ 100% CLIENT-SIDE DSP · ZERO SERVER RECORDING</span>
        </div>
      </div>
    </div>
  );
}
