import { useState, useRef, type KeyboardEvent, type ClipboardEvent } from 'react';
import { registerAccount, isEmailRegistered, type UserProfile } from '../utils/userAuth';
import { sendOTP, verifyOTP, clearActiveOTP, getActiveDemoOTP, isEmailJSConfigured } from '../utils/otpService';

interface Props {
  onSuccess: (user: UserProfile) => void;
  onGoToLogin: () => void;
  demoToast: (msg: string) => void;
}

export default function SignUpPage({ onSuccess, onGoToLogin, demoToast }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('Available · Using ClearVoice DSP');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [isRealEmailSent, setIsRealEmailSent] = useState(false);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const hasEmailJS = isEmailJSConfigured();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    // Check if email already registered
    if (isEmailRegistered(trimmedEmail)) {
      setError('This email already has a ClearVoice account. Please log in instead.');
      return;
    }

    setSending(true);
    setError(null);

    const result = await sendOTP(trimmedEmail);
    setSending(false);

    if (result.success) {
      setStep(2);
      setIsRealEmailSent(result.isRealEmail);
      const activeCode = getActiveDemoOTP();
      setDemoCode(activeCode);
      setTimeout(() => digitRefs.current[0]?.focus(), 100);
    } else {
      setError(result.error || 'Failed to send OTP.');
    }
  };

  const handleVerify = () => {
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit OTP.');
      return;
    }

    const otpResult = verifyOTP(email.trim(), code);
    if (!otpResult.valid) {
      setError(otpResult.error || 'Invalid OTP.');
      return;
    }

    // OTP verified — register account
    const regResult = registerAccount(email, name, status);
    if (regResult.error) {
      setError(regResult.error);
      return;
    }

    if (regResult.user) {
      onSuccess(regResult.user);
    }
  };

  const handleAutoFill = () => {
    if (!demoCode || demoCode.length !== 6) return;
    const next = demoCode.split('');
    setOtpDigits(next);
    setError(null);
    digitRefs.current[5]?.focus();
  };

  const handleDigitChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '').slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      digitRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      digitRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && otpDigits.join('').length === 6) {
      handleVerify();
    }
  };

  const handleDigitPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setOtpDigits(next);
    const focusIndex = Math.min(pasted.length, 5);
    digitRefs.current[focusIndex]?.focus();
  };

  const handleBack = () => {
    setStep(1);
    setOtpDigits(['', '', '', '', '', '']);
    setError(null);
    clearActiveOTP();
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-wrap">
            <div className="auth-emblem">CV</div>
          </div>
          <h2 className="auth-title">CREATE ACCOUNT</h2>
          <p className="auth-subtitle">
            {step === 1
              ? 'Enter your details to get started with ClearVoice'
              : `Verify your email · ${email}`}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="auth-step-indicator">
          <div className={`step-dot ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className="step-line" />
          <div className={`step-dot ${step >= 2 ? 'active' : ''}`}>2</div>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOTP} className="auth-form">
            <div className="auth-input-group">
              <label className="auth-label">Email Address *</label>
              <input
                type="email"
                className="auth-input"
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                autoFocus
                required
              />
              <span className="auth-hint">
                {hasEmailJS
                  ? 'A 6-digit OTP will be emailed to your inbox.'
                  : 'A 6-digit OTP will be generated for instant verification.'}
              </span>
            </div>

            <div className="auth-input-group">
              <label className="auth-label">Display Name</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Alex Rivera"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="auth-input-group">
              <label className="auth-label">Status Tagline</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Available · Using ClearVoice DSP"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              />
            </div>

            {error && <div className="auth-error-banner">{error}</div>}

            <button type="submit" className="auth-submit-btn" disabled={sending}>
              {sending ? 'SENDING OTP…' : 'SEND OTP ⚡'}
            </button>

            <div className="auth-switch-row">
              Already have an account?{' '}
              <button type="button" className="auth-switch-link" onClick={onGoToLogin}>
                LOG IN
              </button>
            </div>
          </form>
        ) : (
          <div className="auth-form">
            {/* Real email vs Demo banner */}
            {isRealEmailSent ? (
              <div className="email-sent-success-box">
                <span className="email-sent-icon">✉️</span>
                <div>
                  <strong>OTP sent to your mailbox!</strong>
                  <p>Check your inbox &amp; spam folder at <strong>{email}</strong>.</p>
                </div>
              </div>
            ) : (
              <div className="demo-otp-banner-card">
                <div className="demo-otp-banner-header">
                  <span className="demo-badge">DEMO MODE ACTIVE</span>
                  <button type="button" className="auto-fill-btn" onClick={handleAutoFill}>
                    AUTO-FILL ⚡
                  </button>
                </div>
                <div className="demo-otp-code-row">
                  <span>YOUR 6-DIGIT OTP:</span>
                  <strong className="demo-otp-code">{demoCode || '------'}</strong>
                </div>
                <p className="demo-otp-note">
                  (Client-only mode: OTP is displayed on-screen so you can test instantly without setting up SMTP servers).
                </p>
              </div>
            )}

            <p className="otp-instruction">Enter the 6-digit verification code:</p>

            <div className="otp-digits-row">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input
                  key={i}
                  ref={(el) => {
                    digitRefs.current[i] = el;
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={otpDigits[i]}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                  onPaste={handleDigitPaste}
                  onFocus={(e) => e.target.select()}
                  className={`otp-digit-input ${otpDigits[i] ? 'filled' : ''}`}
                />
              ))}
            </div>

            {error && <div className="auth-error-banner">{error}</div>}

            <button className="auth-submit-btn" onClick={handleVerify}>
              VERIFY &amp; CREATE ACCOUNT ✓
            </button>

            <div className="auth-actions-row">
              <button className="auth-back-link" onClick={handleBack}>
                ← BACK
              </button>
              <button
                className="auth-resend-link"
                onClick={async () => {
                  setSending(true);
                  const res = await sendOTP(email.trim());
                  setSending(false);
                  setIsRealEmailSent(res.isRealEmail);
                  setDemoCode(getActiveDemoOTP());
                  demoToast('New OTP generated!');
                }}
                disabled={sending}
              >
                {sending ? 'SENDING…' : 'RESEND OTP'}
              </button>
            </div>
          </div>
        )}

        <div className="auth-footer">
          <div className="auth-p2p-pill">
            <span>🔒 100% Client-Side · WebRTC P2P · Zero Cloud</span>
          </div>
        </div>
      </div>
    </div>
  );
}
