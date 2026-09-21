import { useState } from 'react';
import type { ContactInfo } from '../utils/userAuth';

interface Props {
  contact: ContactInfo;
  onClose: () => void;
  onStartChat: (contact: ContactInfo) => void;
  onStartCall: (contactId: string) => void;
}

export default function ContactProfileModal({ contact, onClose, onStartChat, onStartCall }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(contact.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore fallback
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="contact-profile-card" onClick={(e) => e.stopPropagation()}>
        <div className="contact-profile-header">
          <button className="contact-profile-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="contact-profile-body">
          <div
            className="contact-profile-avatar"
            style={{ backgroundColor: contact.avatarColor || '#FFE600' }}
          >
            {contact.name.slice(0, 2).toUpperCase()}
          </div>

          <h3 className="contact-profile-name">{contact.name}</h3>
          <p className="contact-profile-email">{contact.email}</p>

          <div className="contact-id-badge" onClick={handleCopyId} title="Click to copy unique ID">
            <span className="contact-id-label">ClearVoice ID:</span>
            <span className="contact-id-code">#{contact.id}</span>
            <span className="contact-id-copy-icon">{copied ? '✓ Copied' : '📋'}</span>
          </div>

          {contact.status && (
            <div className="contact-about-box">
              <span className="contact-about-title">About</span>
              <p className="contact-about-text">{contact.status}</p>
            </div>
          )}

          <div className="contact-profile-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                onClose();
                onStartChat(contact);
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18, marginRight: 6 }}>
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
              </svg>
              MESSAGE
            </button>
            <button
              className="btn btn-accent-blue"
              onClick={() => {
                onClose();
                onStartCall(contact.id);
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18, marginRight: 6 }}>
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.053 15.053 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1.01A11.36 11.36 0 018.5 3.99c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.61c0-.55-.45-1-.99-1z" />
              </svg>
              CALL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
