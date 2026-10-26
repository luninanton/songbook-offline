import { parseSongPage } from '../core/parser';
import type { Song } from '../core/types';

/**
 * Докачка новых песен напрямую с сайта (этап M6, режим «без пакетов»).
 *
 * Работает по тому же алгоритму, что и краулер: страницы списка /lang/2 → id → страница песни.
 * В WebView запросы идут через нативный HTTP (CapacitorHttp), поэтому CORS не мешает.
 */
const BASE = 'https://holychords.pro';
const SITE_LANG_ID: Record<string, string> = { ru: '2', uk: '3', en: '4' };

export interface SiteSyncOptions {
  lang?: keyof typeof SITE_LANG_ID;
  /** Сколько страниц списка просмотреть (по 50 песен) */
  listPages?: number;
  /** Максимум новых песен, которые скачаем за раз */
  maxSongs?: number;
  /** Наибольший id, который уже есть в базе — всё, что больше, считаем новым */
  minId: number;
}

export interface SiteSyncResult {
  foundIds: number[];
  newIds: number[];
  songs: Song[];
  failed: number;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ru,en;q=0.8' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} для ${url}`);
  return response.text();
}

export async function fetchNewSongs(options: SiteSyncOptions): Promise<SiteSyncResult> {
  const lang = options.lang ?? 'ru';
  const listPages = options.listPages ?? 2;
  const maxSongs = options.maxSongs ?? 30;
  const siteLangId = SITE_LANG_ID[lang] ?? '2';

  const found = new Set<number>();
  for (let page = 1; page <= listPages; page += 1) {
    const html = await fetchText(`${BASE}/lang/${siteLangId}?page=${page}`);
    for (const match of html.matchAll(/href="\/(\d{3,6})"/g)) {
      const id = Number.parseInt(match[1] as string, 10);
      if (Number.isFinite(id)) found.add(id);
    }
  }

  const foundIds = [...found].sort((a, b) => b - a);
  const newIds = foundIds.filter((id) => id > options.minId).slice(0, maxSongs);

  const songs: Song[] = [];
  let failed = 0;

  for (const id of newIds) {
    try {
      const html = await fetchText(`${BASE}/${id}`);
      const { song } = parseSongPage(html, { id, lang });
      if (song.text.trim()) songs.push(song);
    } catch {
      failed += 1;
    }
  }

  return { foundIds, newIds, songs, failed };
}
