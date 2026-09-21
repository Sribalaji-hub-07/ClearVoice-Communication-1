export interface AppSettings {
  defaultSuppression: number;
  defaultMuteOnJoin: boolean;
  defaultBoost: boolean;
  theme: 'dark' | 'midnight';
}

const SETTINGS_KEY = 'clearvoice_app_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  defaultSuppression: 2.0,
  defaultMuteOnJoin: false,
  defaultBoost: false,
  theme: 'dark',
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      defaultSuppression:
        typeof parsed.defaultSuppression === 'number'
          ? Math.max(0, Math.min(5, parsed.defaultSuppression))
          : DEFAULT_SETTINGS.defaultSuppression,
      defaultMuteOnJoin: Boolean(parsed.defaultMuteOnJoin),
      defaultBoost: Boolean(parsed.defaultBoost),
      theme: parsed.theme === 'midnight' ? 'midnight' : 'dark',
    };
  } catch (e) {
    console.error('Failed to load settings', e);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const next: AppSettings = { ...current, ...settings };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
  return next;
}

export function resetSettings(): AppSettings {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (e) {
    console.error('Failed to reset settings', e);
  }
  return DEFAULT_SETTINGS;
}
