import { useEffect, useState } from 'react';
import type { CallState, ConnectionQuality } from '../types/call';

interface Props {
  role: 'caller' | 'receiver';
  state: CallState;
  roomCode: string | null;
  isMuted: boolean;
  isBoosted: boolean;
  suppression: number;
  connectionQuality: ConnectionQuality;
  onToggleMute: () => void;
  onToggleBoost: () => void;
  onSuppressionChange: (value: number) => void;
  onHangup: () => void;
}

function statusText(state: CallState): string {
  switch (state) {
    case 'calling':
      return 'CALLING...';
    case 'ringing':
      return 'RINGING...';
    case 'connecting':
      return 'CONNECTING P2P...';
    case 'connected':
      return 'CONNECTED · DSP LIVE';
    case 'reconnecting':
      return 'RECONNECTING...';
    default:
      return '';
  }
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function InCallView({
  role,
  state,
  roomCode,
  isMuted,
  isBoosted,
  suppression,
  connectionQuality,
  onToggleMute,
  onToggleBoost,
  onSuppressionChange,
  onHangup,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [showSuppressionSheet, setShowSuppressionSheet] = useState(false);
  const isConnected = state === 'connected';

  useEffect(() => {
    if (!isConnected) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div className="incall-shell">
      <div className="incall-top">
        <div className="incall-title">
          {role === 'caller' ? 'CLEARVOICE CALL' : 'CLEARVOICE CALL'}
        </div>
        <div className="incall-status">{isConnected ? formatElapsed(elapsed) : statusText(state)}</div>
        {isConnected && (
          <div className={`connection-quality ${connectionQuality}`}>
            Signal: {connectionQuality.toUpperCase()}
          </div>
        )}
      </div>

      <div className="incall-avatar-wrap">
        <div className={`incall-avatar-ring ${isConnected ? 'live' : 'pulsing'}`}>
          <div className="incall-avatar">CV</div>
        </div>
      </div>

      {showSuppressionSheet && (
        <div className="incall-sheet">
          <div className="slider-label-row">
            <span>NOISE SUPPRESSION STRENGTH</span>
            <span className="slider-value">{suppression === 0 ? 'OFF' : suppression.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={suppression}
            onChange={(e) => onSuppressionChange(parseFloat(e.target.value))}
          />
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 14 }}
            onClick={() => setShowSuppressionSheet(false)}
          >
            DONE
          </button>
        </div>
      )}

      <div className="incall-controls">
        <button
          className={`incall-btn ${isBoosted ? 'incall-btn-active' : ''}`}
          onClick={onToggleBoost}
          title="Speaker Boost (+6dB)"
        >
          <span className="incall-btn-icon">🔊</span>
          <span className="incall-btn-label">{isBoosted ? 'BOOSTED' : 'SPEAKER'}</span>
        </button>
        <button
          className="incall-btn"
          onClick={() => setShowSuppressionSheet((v) => !v)}
          title="Noise Cut Level"
        >
          <span className="incall-btn-icon">🎚️</span>
          <span className="incall-btn-label">NOISE CUT</span>
        </button>
        <button
          className={`incall-btn ${isMuted ? 'incall-btn-active-danger' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          <span className="incall-btn-icon">{isMuted ? '🔇' : '🎙️'}</span>
          <span className="incall-btn-label">{isMuted ? 'MUTED' : 'MUTE'}</span>
        </button>
      </div>

      <button className="incall-end-btn" onClick={onHangup} aria-label="End call">
        END CALL ✕
      </button>
    </div>
  );
}
