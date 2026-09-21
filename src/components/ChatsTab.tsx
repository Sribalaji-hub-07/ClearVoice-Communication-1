import { useState, useEffect, useRef } from 'react';
import {
  getChatThreads,
  getMessagesForContact,
  saveMessage,
  saveChatThread,
  markThreadRead,
  type ChatThread,
  type ChatMessage,
} from '../utils/chatStorage';
import { type UserProfile, type ContactInfo, saveContact } from '../utils/userAuth';
import { formatRelativeTime } from '../utils/callHistory';
import type { ChatPeerManager } from '../p2p/chatPeer';

interface Props {
  currentUser: UserProfile;
  activeContact: ContactInfo | null;
  onSelectContact: (contact: ContactInfo | null) => void;
  onViewContactProfile: (contact: ContactInfo) => void;
  onStartCall: (contactId: string, contactName: string) => Promise<void>;
  chatPeer: ChatPeerManager | null;
  onlinePeers: Set<string>;
  p2pMsgTrigger: number;
}

export default function ChatsTab({
  currentUser,
  activeContact,
  onSelectContact,
  onViewContactProfile,
  onStartCall,
  chatPeer,
  onlinePeers,
  p2pMsgTrigger,
}: Props) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshThreads = () => {
    setThreads(getChatThreads());
  };

  useEffect(() => {
    refreshThreads();
  }, []);

  useEffect(() => {
    if (activeContact) {
      setMessages(getMessagesForContact(activeContact.id));
      markThreadRead(activeContact.id);
      refreshThreads();
      scrollToBottom();
    }
  }, [activeContact]);

  // When App.tsx receives a P2P message, it increments p2pMsgTrigger.
  // Re-read messages from localStorage so the UI updates in real time.
  useEffect(() => {
    if (p2pMsgTrigger === 0) return; // skip initial
    // Refresh the thread list
    refreshThreads();
    // If we're in an active chat, reload messages for that contact
    if (activeContact) {
      setMessages(getMessagesForContact(activeContact.id));
      markThreadRead(activeContact.id);
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2pMsgTrigger]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || !activeContact) return;

    // Save the outgoing message to localStorage immediately
    const newMsg = saveMessage(activeContact.id, {
      senderId: currentUser.id,
      receiverId: activeContact.id,
      text,
      timestamp: Date.now(),
      status: 'sent',
    });

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
    refreshThreads();
    scrollToBottom();

    // Send via P2P DataChannel
    if (chatPeer && activeContact.id !== '2048') {
      const result = await chatPeer.sendMessage(activeContact.id, text);
      if (result.sent) {
        setSendStatus(null);
      } else if (result.queued) {
        setSendStatus('Peer offline — queued for delivery');
        setTimeout(() => setSendStatus(null), 3000);
      }
    }

    // Echo Bot simulation (only for the demo bot)
    if (activeContact.id === '2048') {
      setTimeout(() => {
        const botReply = saveMessage(activeContact.id, {
          senderId: '2048',
          receiverId: currentUser.id,
          text: `[Echo P2P] Received: "${text}". Real-time DSP noise cancellation is active on room #2048.`,
          timestamp: Date.now(),
          status: 'read',
        });
        setMessages((prev) => [...prev, botReply]);
        refreshThreads();
        scrollToBottom();
      }, 1000);
    }
  };

  const handleInputChange = (value: string) => {
    setInputText(value);
    // Send typing indicator
    if (chatPeer && activeContact && activeContact.id !== '2048') {
      chatPeer.sendTypingIndicator(activeContact.id);
    }
  };

  const handleStartNewChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newContactId.trim();
    if (!cleanId || cleanId.length < 3) {
      setNewChatError('Please enter a valid 4-digit ClearVoice ID (e.g. 4821).');
      return;
    }

    if (cleanId === currentUser.id) {
      setNewChatError('You cannot start a chat with your own ClearVoice ID.');
      return;
    }

    const contactName = newContactName.trim() || `User #${cleanId}`;
    const newContact: ContactInfo = {
      id: cleanId,
      name: contactName,
      email: `${cleanId.toLowerCase()}@clearvoice.app`,
      status: 'Direct ClearVoice contact',
      avatarColor: '#00F576',
      lastSeen: 'Unknown',
    };

    saveContact(newContact);
    saveChatThread({
      contactId: newContact.id,
      contactName: newContact.name,
      contactEmail: newContact.email,
      contactStatus: newContact.status,
      avatarColor: newContact.avatarColor,
      lastMessage: 'Chat created',
      lastTimestamp: Date.now(),
      unreadCount: 0,
    });

    refreshThreads();
    setShowNewChatModal(false);
    setNewContactId('');
    setNewContactName('');
    setNewChatError(null);
    onSelectContact(newContact);
  };

  const insertEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  const isContactOnline = (contactId: string): boolean => {
    if (contactId === '2048') return true; // Echo Bot is always "online"
    return onlinePeers.has(contactId);
  };

  // ---------------------------------------------------------------
  // View 1: Active 1-on-1 Chat Conversation Screen
  // ---------------------------------------------------------------
  if (activeContact) {
    const contactOnline = isContactOnline(activeContact.id);

    return (
      <div className="tab-pane active-chat-screen">
        {/* Top Header Bar */}
        <div className="chat-top-bar">
          <button
            className="chat-back-btn"
            onClick={() => onSelectContact(null)}
            aria-label="Back to chat list"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>

          <div
            className="chat-contact-info-wrap"
            onClick={() => onViewContactProfile(activeContact)}
            title="View Contact Profile"
          >
            <div className="chat-contact-avatar-wrap">
              <div
                className="chat-contact-avatar"
                style={{ backgroundColor: activeContact.avatarColor || '#FFE600' }}
              >
                {activeContact.name.slice(0, 2).toUpperCase()}
              </div>
              <div className={`online-indicator ${contactOnline ? 'online' : 'offline'}`} />
            </div>
            <div className="chat-contact-meta">
              <h3 className="chat-contact-name">{activeContact.name}</h3>
              <span className="chat-contact-sub">
                ID #{activeContact.id} ·{' '}
                {peerTyping ? (
                  <span className="typing-indicator-text">typing…</span>
                ) : contactOnline ? (
                  'Online'
                ) : (
                  'Offline'
                )}
              </span>
            </div>
          </div>

          <div className="chat-top-actions">
            <button
              className="chat-action-icon-btn call"
              onClick={() => onStartCall(activeContact.id, activeContact.name)}
              title="Voice Call with Noise Suppression"
              aria-label="Voice Call"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.053 15.053 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1.01A11.36 11.36 0 018.5 3.99c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.61c0-.55-.45-1-.99-1z" />
              </svg>
            </button>
            <button
              className="chat-action-icon-btn info"
              onClick={() => onViewContactProfile(activeContact)}
              title="View Profile"
              aria-label="View Profile"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chat Messages Canvas */}
        <div className="chat-messages-container">
          <div className="chat-p2p-notice">
            <span>
              {contactOnline
                ? '🟢 PEER CONNECTED · DIRECT P2P ENCRYPTION'
                : '⚪ PEER OFFLINE · MESSAGES QUEUED LOCALLY'}
            </span>
          </div>

          {sendStatus && (
            <div className="chat-send-status-banner">{sendStatus}</div>
          )}

          {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.id || msg.senderId === 'me';
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div key={msg.id} className={`chat-bubble-row ${isMe ? 'outgoing' : 'incoming'}`}>
                <div className={`chat-bubble ${isMe ? 'outgoing' : 'incoming'}`}>
                  <p className="chat-bubble-text">{msg.text}</p>
                  <div className="chat-bubble-meta">
                    <span className="chat-bubble-time">{timeStr}</span>
                    {isMe && (
                      <span className="chat-bubble-status" title={msg.status}>
                        {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {peerTyping && (
            <div className="chat-bubble-row incoming">
              <div className="chat-bubble incoming typing-bubble">
                <span className="typing-dots">
                  <span>•</span>
                  <span>•</span>
                  <span>•</span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Emoji Quick Bar */}
        <div className="chat-emoji-bar">
          {['🎙️', '⚡', '👍', '🔥', '✨', '😊', '🔊', '📞'].map((em) => (
            <button key={em} type="button" className="emoji-chip" onClick={() => insertEmoji(em)}>
              {em}
            </button>
          ))}
        </div>

        {/* Chat Input Footer */}
        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input
            type="text"
            className="chat-text-input"
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!inputText.trim()}
            title="Send Message"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // View 2: Chat Thread List Screen
  // ---------------------------------------------------------------
  return (
    <div className="tab-pane chats-tab">
      {/* Header Sticker Card */}
      <div className="chats-header-card">
        <div className="chats-title-row">
          <h2 className="chats-main-title">CHATS</h2>
          <span className="chats-my-id-badge" title="Your ClearVoice ID">
            MY ID: <strong>#{currentUser.id}</strong>
          </span>
        </div>
        <p className="chats-header-desc">
          Direct peer-to-peer encrypted messaging &amp; noise-cancelled voice calling.
          {chatPeer?.connected ? (
            <span className="p2p-status-inline online"> · P2P CONNECTED ✓</span>
          ) : (
            <span className="p2p-status-inline offline"> · CONNECTING…</span>
          )}
        </p>
      </div>

      {/* Threads List */}
      <div className="chat-threads-list">
        {threads.length === 0 ? (
          <div className="empty-chats-state">
            <div className="empty-chats-icon">💬</div>
            <h4>NO CONVERSATIONS YET</h4>
            <p>
              Tap the + NEW CHAT button below to connect with any peer using their 4-digit
              ClearVoice ID!
            </p>
          </div>
        ) : (
          threads.map((t) => (
            <div
              key={t.contactId}
              className="chat-thread-item"
              onClick={() =>
                onSelectContact({
                  id: t.contactId,
                  name: t.contactName,
                  email: t.contactEmail,
                  status: t.contactStatus,
                  avatarColor: t.avatarColor,
                })
              }
            >
              {/* Avatar circle with online indicator */}
              <div className="chat-thread-avatar-wrap">
                <div
                  className="chat-thread-avatar"
                  style={{ backgroundColor: t.avatarColor || '#FFE600' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewContactProfile({
                      id: t.contactId,
                      name: t.contactName,
                      email: t.contactEmail,
                      status: t.contactStatus,
                      avatarColor: t.avatarColor,
                    });
                  }}
                  title="View Profile"
                >
                  {t.contactName.slice(0, 2).toUpperCase()}
                </div>
                <div
                  className={`online-indicator ${isContactOnline(t.contactId) ? 'online' : 'offline'}`}
                />
              </div>

              {/* Thread Details */}
              <div className="chat-thread-details">
                <div className="chat-thread-title-row">
                  <span className="chat-thread-name">{t.contactName}</span>
                  <span className="chat-thread-time">{formatRelativeTime(t.lastTimestamp)}</span>
                </div>
                <div className="chat-thread-sub-row">
                  <p className="chat-thread-snippet">{t.lastMessage}</p>
                  {t.unreadCount > 0 && (
                    <span className="chat-thread-unread-badge">{t.unreadCount}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Neo-Brutalist FAB for New Chat */}
      <button
        className="whatsapp-fab"
        onClick={() => setShowNewChatModal(true)}
        title="Start New Chat"
        aria-label="Start New Chat"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </button>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="modal-backdrop" onClick={() => setShowNewChatModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>START NEW CHAT</h3>
              <button className="modal-close-btn" onClick={() => setShowNewChatModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleStartNewChatSubmit} className="modal-body">
              <p className="modal-desc">
                Enter your contact's 4-digit <strong>ClearVoice ID</strong>:
              </p>

              <div className="auth-input-group">
                <label className="auth-label">ClearVoice ID *</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="e.g. 4821"
                  maxLength={6}
                  value={newContactId}
                  onChange={(e) => {
                    setNewContactId(e.target.value);
                    setNewChatError(null);
                  }}
                  autoFocus
                  required
                />
              </div>

              <div className="auth-input-group" style={{ marginTop: 12 }}>
                <label className="auth-label">Contact Name (Optional)</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="e.g. Sarah Connor"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                />
              </div>

              {newChatError && <div className="error-banner">{newChatError}</div>}

              <div className="modal-actions-row" style={{ marginTop: 20 }}>
                <button type="submit" className="btn btn-primary">
                  OPEN CHAT 💬
                </button>
                <button type="button" className="btn" onClick={() => setShowNewChatModal(false)}>
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
