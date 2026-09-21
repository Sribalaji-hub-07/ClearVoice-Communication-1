import Peer, { type DataConnection } from 'peerjs';

export interface P2PMessage {
  type: 'chat' | 'typing' | 'read' | 'ping';
  senderId: string;
  senderName?: string;
  text?: string;
  timestamp: number;
  messageId?: string;
}

export interface ChatPeerCallbacks {
  onMessage: (msg: P2PMessage) => void;
  onPeerOnline: (peerId: string) => void;
  onPeerOffline: (peerId: string) => void;
  onConnectionStateChange: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onError: (error: string) => void;
}

const PEER_PREFIX = 'clearvoice-chat-';

// Free public STUN/TURN servers for reliable NAT traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Free TURN relay from Open Relay Project (metered.ca)
  {
    urls: 'turn:a.relay.metered.ca:80',
    username: 'e8dd65b92f6dfe2be94c3209',
    credential: 'uWdJjTvn58rlFvtm',
  },
  {
    urls: 'turn:a.relay.metered.ca:443',
    username: 'e8dd65b92f6dfe2be94c3209',
    credential: 'uWdJjTvn58rlFvtm',
  },
  {
    urls: 'turn:a.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65b92f6dfe2be94c3209',
    credential: 'uWdJjTvn58rlFvtm',
  },
];

export class ChatPeerManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private callbacks: ChatPeerCallbacks;
  private userId: string;
  private userName: string;
  private pendingMessages: Map<string, P2PMessage[]> = new Map();
  private isConnectedFlag = false;

  constructor(userId: string, userName: string, callbacks: ChatPeerCallbacks) {
    this.userId = userId;
    this.userName = userName;
    this.callbacks = callbacks;
  }

  /** Update callback references without recreating the peer. */
  updateCallbacks(cb: Partial<ChatPeerCallbacks>) {
    if (cb.onMessage) this.callbacks.onMessage = cb.onMessage;
    if (cb.onPeerOnline) this.callbacks.onPeerOnline = cb.onPeerOnline;
    if (cb.onPeerOffline) this.callbacks.onPeerOffline = cb.onPeerOffline;
    if (cb.onConnectionStateChange) this.callbacks.onConnectionStateChange = cb.onConnectionStateChange;
    if (cb.onError) this.callbacks.onError = cb.onError;
  }

  get connected(): boolean {
    return this.isConnectedFlag;
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const peerId = PEER_PREFIX + this.userId;

      this.peer = new Peer(peerId, {
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      });

      this.peer.on('open', () => {
        this.isConnectedFlag = true;
        this.callbacks.onConnectionStateChange('connected');

        // Listen for incoming data connections
        this.peer!.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });

        resolve();
      });

      this.peer.on('error', (err: any) => {
        if (err.type === 'unavailable-id') {
          // Peer ID taken — might be another tab. Try to destroy and retry once.
          this.callbacks.onError(
            'ClearVoice chat is already open in another tab. Please close it first.',
          );
          this.callbacks.onConnectionStateChange('error');
          reject(new Error('Peer ID already taken'));
        } else if (err.type === 'peer-unavailable') {
          // Target peer not found — they're offline. Not a fatal error.
          console.warn('PeerJS: target peer unavailable (offline)');
        } else {
          console.error('PeerJS chat error:', err);
          this.callbacks.onError('Connection to peer network failed. Check your internet.');
          this.callbacks.onConnectionStateChange('error');
          reject(err);
        }
      });

      this.peer.on('disconnected', () => {
        this.isConnectedFlag = false;
        this.callbacks.onConnectionStateChange('disconnected');
        // Attempt auto-reconnect
        setTimeout(() => {
          if (this.peer && !this.peer.destroyed) {
            try { this.peer.reconnect(); } catch { /* ignore */ }
          }
        }, 3000);
      });

      this.peer.on('close', () => {
        this.isConnectedFlag = false;
        this.callbacks.onConnectionStateChange('disconnected');
      });
    });
  }

  private handleIncomingConnection(conn: DataConnection) {
    const contactId = conn.peer.replace(PEER_PREFIX, '');

    conn.on('open', () => {
      // Replace any stale connection
      const old = this.connections.get(contactId);
      if (old && old !== conn) {
        try { old.close(); } catch { /* */ }
      }
      this.connections.set(contactId, conn);
      this.callbacks.onPeerOnline(contactId);

      // Flush any pending messages for this contact
      this.flushPendingMessages(contactId);
    });

    conn.on('data', (data: unknown) => {
      try {
        const msg = data as P2PMessage;
        if (msg && msg.type) {
          this.callbacks.onMessage(msg);
        }
      } catch (e) {
        console.error('Failed to parse incoming P2P message:', e);
      }
    });

    conn.on('close', () => {
      if (this.connections.get(contactId) === conn) {
        this.connections.delete(contactId);
        this.callbacks.onPeerOffline(contactId);
      }
    });

    conn.on('error', () => {
      if (this.connections.get(contactId) === conn) {
        this.connections.delete(contactId);
        this.callbacks.onPeerOffline(contactId);
      }
    });
  }

  private async getOrCreateConnection(contactId: string): Promise<DataConnection | null> {
    // Reuse existing open connection
    const existing = this.connections.get(contactId);
    if (existing && existing.open) {
      return existing;
    }

    // Remove stale connection
    if (existing) {
      this.connections.delete(contactId);
    }

    if (!this.peer || this.peer.destroyed) {
      return null;
    }

    const targetPeerId = PEER_PREFIX + contactId;

    return new Promise((resolve) => {
      const conn = this.peer!.connect(targetPeerId, {
        reliable: true,
      });

      const timeout = setTimeout(() => {
        resolve(null);
        this.callbacks.onPeerOffline(contactId);
      }, 8000); // 8s timeout for connection attempts

      conn.on('open', () => {
        clearTimeout(timeout);

        // Replace old connection
        const old = this.connections.get(contactId);
        if (old && old !== conn) {
          try { old.close(); } catch { /* */ }
        }
        this.connections.set(contactId, conn);
        this.callbacks.onPeerOnline(contactId);

        conn.on('data', (data: unknown) => {
          try {
            const msg = data as P2PMessage;
            if (msg && msg.type) {
              this.callbacks.onMessage(msg);
            }
          } catch (e) {
            console.error('Failed to parse incoming P2P message:', e);
          }
        });

        conn.on('close', () => {
          if (this.connections.get(contactId) === conn) {
            this.connections.delete(contactId);
            this.callbacks.onPeerOffline(contactId);
          }
        });

        this.flushPendingMessages(contactId);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        console.warn('DataConnection error to', contactId, err);
        this.callbacks.onPeerOffline(contactId);
        resolve(null);
      });
    });
  }

  private flushPendingMessages(contactId: string) {
    const pending = this.pendingMessages.get(contactId);
    if (!pending || pending.length === 0) return;

    const conn = this.connections.get(contactId);
    if (!conn || !conn.open) return;

    for (const msg of pending) {
      try {
        conn.send(msg);
      } catch (e) {
        console.error('Failed to flush pending message:', e);
      }
    }
    this.pendingMessages.delete(contactId);
  }

  /**
   * Send a chat message to a contact.
   * Returns { sent: true } if delivered immediately, or { sent: false, queued: true }
   * if the peer is offline and the message was queued locally.
   */
  async sendMessage(
    contactId: string,
    text: string,
  ): Promise<{ sent: boolean; queued: boolean }> {
    const msg: P2PMessage = {
      type: 'chat',
      senderId: this.userId,
      senderName: this.userName,
      text,
      timestamp: Date.now(),
      messageId: `p2p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };

    const conn = await this.getOrCreateConnection(contactId);

    if (conn && conn.open) {
      try {
        conn.send(msg);
        return { sent: true, queued: false };
      } catch {
        this.queueMessage(contactId, msg);
        return { sent: false, queued: true };
      }
    } else {
      this.queueMessage(contactId, msg);
      return { sent: false, queued: true };
    }
  }

  private queueMessage(contactId: string, msg: P2PMessage) {
    const existing = this.pendingMessages.get(contactId) || [];
    existing.push(msg);
    this.pendingMessages.set(contactId, existing);
  }

  sendTypingIndicator(contactId: string) {
    const conn = this.connections.get(contactId);
    if (conn && conn.open) {
      try {
        conn.send({
          type: 'typing',
          senderId: this.userId,
          timestamp: Date.now(),
        } as P2PMessage);
      } catch {
        // Silently ignore
      }
    }
  }

  isContactConnected(contactId: string): boolean {
    const conn = this.connections.get(contactId);
    return !!conn && conn.open;
  }

  async checkPeerOnline(contactId: string): Promise<boolean> {
    const conn = await this.getOrCreateConnection(contactId);
    return conn !== null && conn.open;
  }

  disconnect() {
    this.connections.forEach((conn) => {
      try {
        conn.close();
      } catch {
        /* */
      }
    });
    this.connections.clear();
    this.pendingMessages.clear();

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this.isConnectedFlag = false;
  }
}
