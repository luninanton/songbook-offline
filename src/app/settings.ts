export type ThemeMode = 'auto' | 'light' | 'dark';

export interface Settings {
  theme: ThemeMode;
  fontSize: number;
  columns: 1 | 2 | 3;
  showChords: boolean;
  highlightChords: boolean;
  wifiOnlyUpdates: boolean;
  /** Ширина списка песен на планшете, px */
  listWidth: number;
  /** Список свёрнут (планшет) */
  listCollapsed: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  songIds: number[];
}

const SETTINGS_KEY = 'hc.settings.v1';
const FAVORITES_KEY = 'hc.favorites.v1';
const PLAYLISTS_KEY = 'hc.playlists.v1';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  fontSize: 18,
  columns: 1,
  showChords: true,
  highlightChords: true,
  wifiOnlyUpdates: true,
  listWidth: 380,
  listCollapsed: false,
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // приватный режим или переполнение — настройки просто не сохранятся
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

export function loadFavorites(): number[] {
  const ids = readJson<number[]>(FAVORITES_KEY, []);
  return Array.isArray(ids) ? ids : [];
}

export function toggleFavorite(id: number): number[] {
  const ids = loadFavorites();
  const next = ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
  writeJson(FAVORITES_KEY, next);
  return next;
}

export function loadPlaylists(): Playlist[] {
  const lists = readJson<Playlist[]>(PLAYLISTS_KEY, []);
  return Array.isArray(lists) ? lists : [];
}

export function savePlaylists(lists: Playlist[]): void {
  writeJson(PLAYLISTS_KEY, lists);
}

export function applyTheme(theme: ThemeMode): void {
  document.body.dataset.theme = theme;
}
