import { useState, useEffect } from 'react';
import { getSettings, saveSettings, resetSettings, type AppSettings } from '../utils/settingsStorage';
import { clearRecentCalls } from '../utils/callHistory';

interface Props {
  suppression: number;
  onSuppressionChange: (val: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export default function SettingsTab({
  suppression,
  onSuppressionChange,
}: Props) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [showToast, setShowToast] = useState<string | null>(null);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 2500);
  };

  const handleSuppressionPrefChange = (val: number) => {
    const updated = saveSettings({ defaultSuppression: val });
    setSettings(updated);
    onSuppressionChange(val);
  };

  const handleMuteToggle = () => {
    const nextVal = !settings.defaultMuteOnJoin;
    const updated = saveSettings({ defaultMuteOnJoin: nextVal });
    setSettings(updated);
    triggerToast(nextVal ? 'Default set to Mute on Join' : 'Default set to Unmuted on Join');
  };

  const handleBoostToggle = () => {
    const nextVal = !settings.defaultBoost;
    const updated = saveSettings({ defaultBoost: nextVal });
    setSettings(updated);
    triggerToast(nextVal ? 'Speaker boost enabled by default' : 'Normal speaker volume by default');
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear your local call history?')) {
      clearRecentCalls();
      triggerToast('Call history cleared');
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all settings to default values?')) {
      const reset = resetSettings();
      setSettings(reset);
      onSuppressionChange(reset.defaultSuppression);
      triggerToast('Preferences reset to default');
    }
  };

  return (
    <div className="tab-pane settings-tab">
      {/* Toast Notification */}
      {showToast && <div className="settings-toast">{showToast}</div>}

      {/* Section 1: Audio Engine Preferences */}
      <div className="settings-section">
        <h3 className="settings-section-title">Audio &amp; DSP Engine</h3>

        <div className="settings-item">
          <div className="settings-item-header">
            <div className="settings-item-text">
              <span className="settings-item-label">Default Noise Suppression</span>
              <span className="settings-item-desc">
                Spectral subtraction factor applied to your microphone
              </span>
            </div>
            <span className="settings-item-value">{suppression.toFixed(1)} / 5.0</span>
          </div>

          <div style={{ marginTop: 12 }}>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={suppression}
              onChange={(e) => handleSuppressionPrefChange(parseFloat(e.target.value))}
            />
            <div className="suppression-preset-chips">
              <button
                className={`preset-chip ${suppression === 0 ? 'active' : ''}`}
                onClick={() => handleSuppressionPrefChange(0)}
              >
                Bypass (0.0)
              </button>
              <button
                className={`preset-chip ${suppression === 1.5 ? 'active' : ''}`}
                onClick={() => handleSuppressionPrefChange(1.5)}
              >
                Light (1.5)
              </button>
              <button
                className={`preset-chip ${suppression === 2.0 ? 'active' : ''}`}
                onClick={() => handleSuppressionPrefChange(2.0)}
              >
                Default (2.0)
              </button>
              <button
                className={`preset-chip ${suppression === 3.5 ? 'active' : ''}`}
                onClick={() => handleSuppressionPrefChange(3.5)}
              >
                Aggressive (3.5)
              </button>
            </div>
          </div>
        </div>

        <div className="settings-row-toggle" onClick={handleMuteToggle}>
          <div className="settings-item-text">
            <span className="settings-item-label">Mute Microphone on Join</span>
            <span className="settings-item-desc">
              Automatically enter new calls with your microphone muted
            </span>
          </div>
          <button
            className={`toggle-switch ${settings.defaultMuteOnJoin ? 'on' : 'off'}`}
            aria-checked={settings.defaultMuteOnJoin}
            role="switch"
          >
            <span className="toggle-switch-handle" />
          </button>
        </div>

        <div className="settings-row-toggle" onClick={handleBoostToggle}>
          <div className="settings-item-text">
            <span className="settings-item-label">Incoming Speaker Boost (+6dB)</span>
            <span className="settings-item-desc">
              Apply digital gain stage to incoming remote voice stream
            </span>
          </div>
          <button
            className={`toggle-switch ${settings.defaultBoost ? 'on' : 'off'}`}
            aria-checked={settings.defaultBoost}
            role="switch"
          >
            <span className="toggle-switch-handle" />
          </button>
        </div>
      </div>

      {/* Section 2: Storage & Device Data */}
      <div className="settings-section">
        <h3 className="settings-section-title">Data &amp; Device Storage</h3>

        <button className="settings-action-btn danger" onClick={handleClearHistory}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
          <span>Clear Local Call History</span>
        </button>

        <button className="settings-action-btn" onClick={handleResetDefaults}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
          </svg>
          <span>Reset Settings to Defaults</span>
        </button>
      </div>

      {/* Section 3: Privacy & About */}
      <div className="settings-section">
        <h3 className="settings-section-title">About ClearVoice</h3>

        <div className="settings-info-card">
          <div className="settings-info-header">
            <span className="p2p-badge-emerald">100% P2P &amp; Private</span>
            <span className="settings-version-tag">PWA v1.0.0</span>
          </div>
          <p className="settings-info-body">
            ClearVoice executes real-time adaptive noise suppression entirely on your device
            using high-performance <strong>STFT Spectral Subtraction</strong> inside a dedicated{' '}
            <code>AudioWorklet</code> thread.
          </p>
          <p className="settings-info-body">
            Voice calls travel directly between peers over encrypted <strong>WebRTC</strong>. Your raw
            or enhanced audio never touches a server, database, or external cloud pipeline.
          </p>
        </div>
      </div>
    </div>
  );
}
