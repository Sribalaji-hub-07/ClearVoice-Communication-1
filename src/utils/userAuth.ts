export interface UserProfile {
  id: string;
  email: string;
  name: string;
  status: string;
  avatarColor: string;
  createdAt: number;
}

export interface ContactInfo {
  id: string;
  name: string;
  email: string;
  status?: string;
  avatarColor: string;
  lastSeen?: string;
}

export interface RegisteredAccount {
  id: string;
  email: string;
  name: string;
  status: string;
  avatarColor: string;
  createdAt: number;
}

const AUTH_STORAGE_KEY = 'clearvoice_user_session';
const CONTACTS_STORAGE_KEY = 'clearvoice_saved_contacts';
const ACCOUNT_REGISTRY_KEY = 'clearvoice_account_registry';

const AVATAR_COLORS = [
  '#FFE600', // Cyber Yellow
  '#00F576', // Electric Lime
  '#00E5FF', // Electric Sky
  '#FF3366', // Hot Coral Pink
  '#FF9100', // Neon Orange
  '#A855F7', // Vivid Purple
  '#25D366', // Emerald
  '#38BDF8', // Cyan
];

function generateUniqueIdFromEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  return String(positive % 9000 + 1000);
}

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

/* ============================================================
   ACCOUNT REGISTRY — one email = one account enforcement
   ============================================================ */

export function getRegisteredAccounts(): RegisteredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNT_REGISTRY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function isEmailRegistered(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return getRegisteredAccounts().some((a) => a.email === normalized);
}

export function getAccountByEmail(email: string): RegisteredAccount | null {
  const normalized = email.trim().toLowerCase();
  return getRegisteredAccounts().find((a) => a.email === normalized) || null;
}

function saveAccountToRegistry(account: RegisteredAccount): void {
  const accounts = getRegisteredAccounts().filter((a) => a.email !== account.email);
  accounts.push(account);
  try {
    localStorage.setItem(ACCOUNT_REGISTRY_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save account registry', e);
  }
}

/* ============================================================
   SESSION MANAGEMENT
   ============================================================ */

export function getCurrentUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Register a new account (Sign Up flow).
 * Returns an error if the email is already registered.
 */
export function registerAccount(
  email: string,
  name: string,
  status?: string,
): { user: UserProfile | null; error?: string } {
  const trimmedEmail = email.trim().toLowerCase();

  if (isEmailRegistered(trimmedEmail)) {
    return { user: null, error: 'This email already has a ClearVoice account. Please log in instead.' };
  }

  const trimmedName = name.trim() || trimmedEmail.split('@')[0];
  const uniqueId = generateUniqueIdFromEmail(trimmedEmail);
  const avatarColor = getRandomColor();

  const user: UserProfile = {
    id: uniqueId,
    email: trimmedEmail,
    name: trimmedName,
    status: status?.trim() || 'Available · Using ClearVoice DSP',
    avatarColor,
    createdAt: Date.now(),
  };

  // Save to registry
  saveAccountToRegistry({
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    avatarColor: user.avatarColor,
    createdAt: user.createdAt,
  });

  // Set active session
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save user session', e);
  }

  return { user };
}

/**
 * Log in to an existing account (Login flow).
 * Returns an error if the email is not registered.
 */
export function loginAccount(email: string): { user: UserProfile | null; error?: string } {
  const trimmedEmail = email.trim().toLowerCase();
  const account = getAccountByEmail(trimmedEmail);

  if (!account) {
    return { user: null, error: 'No account found with this email. Please sign up first.' };
  }

  const user: UserProfile = {
    id: account.id,
    email: account.email,
    name: account.name,
    status: account.status,
    avatarColor: account.avatarColor,
    createdAt: account.createdAt,
  };

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save user session', e);
  }

  return { user };
}

export function updateUserProfile(updates: Partial<UserProfile>): UserProfile | null {
  const current = getCurrentUser();
  if (!current) return null;

  const updated: UserProfile = { ...current, ...updates };

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to update user session', e);
  }

  // Also update registry
  const account = getAccountByEmail(updated.email);
  if (account) {
    saveAccountToRegistry({
      ...account,
      name: updated.name,
      status: updated.status,
      avatarColor: updated.avatarColor,
    });
  }

  return updated;
}

export function logoutUser(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to remove user session', e);
  }
}

/* ============================================================
   CONTACTS
   ============================================================ */

export function getSavedContacts(): ContactInfo[] {
  try {
    const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!raw) {
      return [
        {
          id: '2048',
          name: 'ClearVoice Echo Bot',
          email: 'echobot@clearvoice.app',
          status: 'Direct peer audio & text testing',
          avatarColor: '#FFE600',
          lastSeen: 'Online',
        },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveContact(contact: ContactInfo): void {
  const contacts = getSavedContacts().filter((c) => c.id !== contact.id);
  const updated = [contact, ...contacts];
  try {
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save contact', e);
  }
}
