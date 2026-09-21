interface Props {
  onGoToSignUp: () => void;
  onGoToLogin: () => void;
}

export default function AuthLanding({ onGoToSignUp, onGoToLogin }: Props) {
  return (
    <div className="auth-overlay">
      <div className="auth-landing-card">
        <div className="auth-header">
          <div className="auth-logo-wrap">
            <div className="auth-emblem">CV</div>
          </div>
          <h2 className="auth-title">CLEARVOICE</h2>
          <p className="auth-subtitle">Noise-Free Voice Calls &amp; Instant P2P Messaging</p>
        </div>

        <div className="auth-landing-actions">
          <button className="auth-submit-btn" onClick={onGoToSignUp}>
            SIGN UP ⚡
          </button>
          <button className="auth-login-btn" onClick={onGoToLogin}>
            LOG IN →
          </button>
        </div>

        <div className="auth-footer">
          <div className="auth-p2p-pill">
            <span>🔒 100% Client-Side · WebRTC P2P · Zero Cloud</span>
          </div>
        </div>
      </div>
    </div>
  );
}
