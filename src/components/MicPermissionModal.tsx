import React, { useEffect, useState } from 'react';
import type { MicPermissionState } from '../audio/types';

interface Props {
  permissionState: MicPermissionState;
  error: string | null;
  onGrant: () => void;
  onCancel: () => void;
}

export default function MicPermissionModal({ permissionState, error, onGrant, onCancel }: Props) {
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    // Small delay to trigger CSS entry animations
    const timer = requestAnimationFrame(() => {
      setIsRendered(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const isDenied = permissionState === 'denied' || error !== null;
  const isRequesting = permissionState === 'requesting';

  return (
    <div className={`glass-modal-backdrop ${isRendered ? 'visible' : ''}`}>
      <div className={`glass-modal-card ${isRendered ? 'visible' : ''}`}>
        
        {/* Animated Glow Elements */}
        <div className="glass-glow glow-1"></div>
        <div className="glass-glow glow-2"></div>

        <div className="glass-modal-content">
          <div className="glass-icon-wrapper">
            {isDenied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#FF3366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            ) : (
              <svg className={isRequesting ? 'pulse-anim' : ''} viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            )}
          </div>

          <h2 className="glass-title">
            {isDenied ? 'Microphone Access Denied' : 'Microphone Permission Required'}
          </h2>
          
          <div className="glass-description">
            {error ? (
              <p className="glass-error-text">{error}</p>
            ) : (
              <p>ClearVoice needs access to your microphone to process real-time adaptive noise suppression.</p>
            )}
          </div>

          {isDenied && error?.includes('getUserMedia') && (
            <div className="glass-help-box">
              <strong>Tip:</strong> If you are testing over a local network, you must use <code>HTTPS</code> or install the Android APK, because modern browsers block microphone access over unsecured HTTP.
            </div>
          )}

          <div className="glass-actions">
            {!isDenied && (
              <button 
                className={`glass-btn primary ${isRequesting ? 'loading' : ''}`} 
                onClick={onGrant}
                disabled={isRequesting}
              >
                {isRequesting ? 'WAITING...' : 'GRANT ACCESS'}
              </button>
            )}
            <button className="glass-btn secondary" onClick={onCancel}>
              {isDenied ? 'CLOSE' : 'CANCEL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
