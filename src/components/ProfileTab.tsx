import { useState } from 'react';
import { type UserProfile, updateUserProfile } from '../utils/userAuth';
import { clearRecentCalls } from '../utils/callHistory';
import { clearAllChats } from '../utils/chatStorage';
import { saveSettings, type AppSettings } from '../utils/settingsStorage';

interface Props {
  currentUser: UserProfile;
  settings: AppSettings;
  suppression: number;
  onUpdateUser: (user: UserProfile) => void;
  onSuppressionChange: (val: number) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onLogout: () => void;
}

export default function ProfileTab({
  currentUser,
  settings,
  suppression,
  onUpdateUser,
  onSuppressionChange,
  onSettingsChange,
  onLogout,
}: Props) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser.name);
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusInput, setStatusInput] = useState(currentUser.status);
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(currentUser.id);
      setCopied(true);
      showToast('ClearVoice ID copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(`Your ID is #${currentUser.id}`);
    }
  };

  const handleSaveName = () => {
    if (!nameInput.trim()) return;
    const updated = updateUserProfile({ name: nameInput.trim() });
    if (updated) onUpdateUser(updated);
    setIsEditingName(false);
    showToast('Name updated');
  };

  const handleSaveStatus = () => {
    const updated = updateUserProfile({ status: statusInput.trim() });
    if (updated) onUpdateUser(updated);
    setIsEditingStatus(false);
    showToast('Status updated');
  };

  const handleSuppressionPrefChange = (val: number) => {
    const next = saveSettings({ defaultSuppression: val });
    onSettingsChange(next);
    onSuppressionChange(val);
  };

  const handleMuteToggle = () => {
    const nextVal = !settings.defaultMuteOnJoin;
    const next = saveSettings({ defaultMuteOnJoin: nextVal });
    onSettingsChange(next);
    showToast(nextVal ? 'Mute on join enabled' : 'Mute on join disabled');
  };

  const handleBoostToggle = () => {
    const nextVal = !settings.defaultBoost;
    const next = saveSettings({ defaultBoost: nextVal });
    onSettingsChange(next);
    showToast(nextVal ? 'Speaker boost enabled' : 'Normal speaker volume');
  };

  const handleClearData = () => {
    if (window.confirm('Clear all local chat messages and call history on this device?')) {
      clearAllChats();
      clearRecentCalls();
      showToast('Local history cleared');
    }
  };

  return (
    <div className="tab-pane profile-tab">
      {/* Toast Notification */}
      {toastMsg && <div className="settings-toast">{toastMsg}</div>}

      {/* Main Profile Hero Card */}
      <div className="profile-hero-card">
        <div
          className="profile-hero-avatar"
          style={{ backgroundColor: currentUser.avatarColor || '#FFE600' }}
        >
          {currentUser.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Name section */}
        <div className="profile-hero-name-row">
          {isEditingName ? (
            <div className="profile-inline-edit">
              <input
                type="text"
                className="profile-edit-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
              />
              <button className="profile-save-btn" onClick={handleSaveName}>
                SAVE
              </button>
            </div>
          ) : (
            <div className="profile-display-name-wrap">
              <h2 className="profile-display-name">{currentUser.name}</h2>
              <button
                className="profile-edit-icon-btn"
                onClick={() => setIsEditingName(true)}
                title="Edit name"
                aria-label="Edit name"
              >
                ✎
              </button>
            </div>
          )}
        </div>

        <p className="profile-email-text">{currentUser.email}</p>

        {/* Unique ClearVoice ID Card */}
        <div className="profile-id-box" onClick={handleCopyId} title="Click to copy your unique ID">
          <div className="profile-id-info">
            <span className="profile-id-title">UNIQUE CLEARVOICE ID</span>
            <span className="profile-id-digits">#{currentUser.id}</span>
          </div>
          <button className="profile-copy-id-btn">
            {copied ? '✓ COPIED' : 'COPY ID 📋'}
          </button>
        </div>
      </div>

      {/* About / Status Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">ABOUT &amp; STATUS</h3>
        <div className="settings-item">
          {isEditingStatus ? (
            <div className="profile-inline-edit">
              <input
                type="text"
                className="profile-edit-input"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
                autoFocus
              />
              <button className="profile-save-btn" onClick={handleSaveStatus}>
                SAVE
              </button>
            </div>
          ) : (
            <div className="profile-status-display" onClick={() => setIsEditingStatus(true)}>
              <span className="profile-status-text">{currentUser.status}</span>
              <span className="profile-status-edit-hint">✎ EDIT</span>
            </div>
          )}
        </div>
      </div>

      {/* Audio Engine Preferences */}
      <div className="settings-section">
        <h3 className="settings-section-title">AUDIO &amp; DSP PREFERENCES</h3>

        <div className="settings-item">
          <div className="settings-item-header">
            <div className="settings-item-text">
              <span className="settings-item-label">DEFAULT NOISE SUPPRESSION</span>
              <span className="settings-item-desc">Spectral oversubtraction factor</span>
            </div>
            <span className="settings-item-value">{suppression.toFixed(1)} / 5.0</span>
          </div>

          <div style={{ marginTop: 14 }}>
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
            <span className="settings-item-label">MUTE MICROPHONE ON JOIN</span>
            <span className="settings-item-desc">Join new calls with mic muted</span>
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
            <span className="settings-item-label">INCOMING SPEAKER BOOST (+6dB)</span>
            <span className="settings-item-desc">Digital gain stage for remote voice</span>
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

      {/* Data & Security Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">DATA &amp; SECURITY</h3>

        <button className="settings-action-btn danger" onClick={handleClearData}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
          <span>CLEAR LOCAL CHATS &amp; CALLS</span>
        </button>

        <button className="settings-action-btn danger" onClick={onLogout}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
          </svg>
          <span>LOG OUT OF CLEARVOICE</span>
        </button>
      </div>

      {/* About Box */}
      <div className="settings-section">
        <div className="settings-info-card">
          <div className="settings-info-header">
            <span className="p2p-badge-emerald">CLEARVOICE P2P DSP</span>
            <span className="settings-version-tag">v2.0 PWA</span>
          </div>
          <p className="settings-info-body">
            ClearVoice delivers high-speed real-time adaptive noise suppression running directly in your browser
            via Web Audio STFT spectral subtraction.
          </p>
          <p className="settings-info-body">
            Messages and calls connect directly between peers using encrypted WebRTC. Audio and
            text never pass through a cloud database.
          </p>
        </div>
      </div>
    </div>
  );
}
