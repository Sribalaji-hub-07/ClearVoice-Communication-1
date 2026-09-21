export type CallDirection = 'outgoing' | 'incoming';
export type CallStatus = 'connected' | 'missed' | 'failed' | 'ended';

export interface CallRecord {
  id: string;
  roomCode: string;
  role: 'caller' | 'callee';
  timestamp: number;
  durationSec: number;
  status: CallStatus;
  label?: string;
}

const STORAGE_KEY = 'clearvoice_recent_calls';
const MAX_CALL_RECORDS = 50;

export function getRecentCalls(): CallRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to read recent calls from storage', e);
  }
  return [];
}

export function saveRecentCall(record: Omit<CallRecord, 'id'>): CallRecord {
  const calls = getRecentCalls();
  const newRecord: CallRecord = {
    ...record,
    id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  // Prepend to list and enforce maximum capacity
  const updated = [newRecord, ...calls.filter((c) => c.roomCode !== record.roomCode || Date.now() - c.timestamp > 2000)].slice(0, MAX_CALL_RECORDS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save call to storage', e);
  }

  return newRecord;
}

export function updateRecentCall(id: string, updates: Partial<CallRecord>): void {
  const calls = getRecentCalls();
  const index = calls.findIndex((c) => c.id === id);
  if (index === -1) return;

  calls[index] = { ...calls[index], ...updates };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calls));
  } catch (e) {
    console.error('Failed to update call in storage', e);
  }
}

export function deleteRecentCall(id: string): void {
  const calls = getRecentCalls().filter((c) => c.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calls));
  } catch (e) {
    console.error('Failed to delete call from storage', e);
  }
}

export function clearRecentCalls(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear recent calls', e);
  }
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) {
    const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Today, ${timeStr}`;
  }
  if (diffDays === 1) {
    const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Yesterday, ${timeStr}`;
  }
  if (diffDays < 7) {
    const dayName = new Date(timestamp).toLocaleDateString([], { weekday: 'short' });
    const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dayName}, ${timeStr}`;
  }

  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
