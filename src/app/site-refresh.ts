import { parseSongPage } from '../core/parser';
import type { Song } from '../core/types';

/**
 * Обновление базы напрямую с сайта (этап M6, основной режим).
 *
 * Два сценария:
 *  1. Быстрый: читаем первые страницы списка `/lang/2`, берём id больше максимального
 *     в базе (нумерация возрастающая) — это новые песни.
 *  2. Полный: забираем весь каталог id (все страницы списка) и проверяем каждую песню
 *     по хэшу. Так ловятся правки текста, смена тональности и удаления с сайта.
 *     Долго (десятки минут) и с заметным трафиком, поэтому только по явной кнопке.
 */
const BASE = 'https://holychords.pro';
const SITE_LANG_ID: Record<string, string> = { ru: '2', uk: '3', en: '4' };

export interface SiteOptions {
  lang?: keyof typeof SITE_LANG_ID;
  /** Остановить работу (пользователь нажал «Остановить») */
  isCancelled?: () => boolean;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ru,en;q=0.8' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} для ${url}`);
  return response.text();
}

function idsFromListPage(html: string): number[] {
  const ids: number[] = [];
  for (const match of html.matchAll(/href="\/(\d{3,6})"/g)) {
    const id = Number.parseInt(match[1] as string, 10);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

export interface CatalogProgress {
  page: number;
  total: number;
  ids: number;
}

/** Собирает id песен из списка. pages = 0 → до конца каталога. */
export async function fetchCatalogIds(
  pages: number,
  options: SiteOptions & { onProgress?: (progress: CatalogProgress) => void } = {},
): Promise<number[]> {
  const siteLangId = SITE_LANG_ID[options.lang ?? 'ru'] ?? '2';
  const ids = new Set<number>();
  const limit = pages > 0 ? pages : 1000;
  let emptyInRow = 0;

  for (let page = 1; page <= limit; page += 1) {
    if (options.isCancelled?.()) break;

    let html: string;
    try {
      html = await fetchText(`${BASE}/lang/${siteLangId}?page=${page}`);
    } catch {
      emptyInRow += 1;
      if (emptyInRow >= 3) break;
      continue;
    }

    const found = idsFromListPage(html);
    const before = ids.size;
    for (const id of found) ids.add(id);
    const added = ids.size - before;

    options.onProgress?.({ page, total: limit, ids: ids.size });

    if (added === 0) {
      emptyInRow += 1;
      if (emptyInRow >= 2) break;
    } else {
      emptyInRow = 0;
    }
  }

  return [...ids];
}

export interface QuickUpdateResult {
  foundIds: number[];
  newIds: number[];
  songs: Song[];
  failed: number;
}

/** Быстрое обновление: только новые песни из первых страниц списка */
export async function fetchNewSongs(
  options: SiteOptions & { minId: number; pages?: number; maxSongs?: number },
): Promise<QuickUpdateResult> {
  const pages = options.pages ?? 3;
  const maxSongs = options.maxSongs ?? 30;
  const found = await fetchCatalogIds(pages, options);
  const foundIds = [...new Set(found)].sort((a, b) => b - a);
  const newIds = foundIds.filter((id) => id > options.minId).slice(0, maxSongs);

  const songs: Song[] = [];
  let failed = 0;

  for (const id of newIds) {
    if (options.isCancelled?.()) break;
    try {
      const html = await fetchText(`${BASE}/${id}`);
      const { song } = parseSongPage(html, { id, lang: options.lang ?? 'ru' });
      if (song.text.trim()) songs.push(song);
    } catch {
      failed += 1;
    }
  }

  return { foundIds, newIds, songs, failed };
}

export interface DeepProgress {
  scanned: number;
  total: number;
  changed: number;
  removed: number;
  failed: number;
}

export interface DeepUpdateResult {
  songs: Song[];
  removed: number[];
  scanned: number;
  failed: number;
  cancelled: boolean;
}

/** Изменилась ли песня относительно локальной копии (сравнение по хэшу) */
export function isSongChanged(song: Song, localHash: string | undefined): boolean {
  return localHash !== undefined && localHash !== song.hash;
}

/** id, которые есть в базе, но пропали с сайта */
export function findRemoved(localIds: Iterable<number>, remoteIds: ReadonlySet<number>): number[] {
  const removed: number[] = [];
  for (const id of localIds) {
    if (!remoteIds.has(id)) removed.push(id);
  }
  return removed;
}

/**
 * Полная проверка: скачивает каждую песню из каталога и сравнивает с локальной базой.
 * Не изменяет базу — возвращает найденные изменения, применение отдельным шагом.
 */
export async function scanAllSongs(
  options: SiteOptions & {
    ids: number[];
    localHashes: ReadonlyMap<number, string>;
    concurrency?: number;
    onProgress?: (progress: DeepProgress) => void;
  },
): Promise<DeepUpdateResult> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const ids = options.ids;
  const songs: Song[] = [];
  let scanned = 0;
  let failed = 0;
  let cancelled = false;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (options.isCancelled?.()) {
        cancelled = true;
        return;
      }
      const index = cursor;
      cursor += 1;
      const id = ids[index];
      if (id === undefined) return;

      try {
        const html = await fetchText(`${BASE}/${id}`);
        const { song } = parseSongPage(html, { id, lang: options.lang ?? 'ru' });
        if (isSongChanged(song, options.localHashes.get(id))) songs.push(song);
      } catch {
        failed += 1;
      }

      scanned += 1;
      if (scanned % 25 === 0) {
        options.onProgress?.({
          scanned,
          total: ids.length,
          changed: songs.length,
          removed: 0,
          failed,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return { songs, removed: [], scanned, failed, cancelled };
}

/** Проверяет конкретные песни (избранное) и возвращает изменённые */
export async function refreshSongs(
  ids: number[],
  options: SiteOptions & {
    localHashes: ReadonlyMap<number, string>;
    concurrency?: number;
    onProgress?: (progress: DeepProgress) => void;
  },
): Promise<DeepUpdateResult> {
  return scanAllSongs({
    ids,
    localHashes: options.localHashes,
    concurrency: options.concurrency ?? 2,
    lang: options.lang,
    isCancelled: options.isCancelled,
    onProgress: options.onProgress,
  });
}

/** Скачивает одну песню с сайта (кнопка обновления на экране песни) */
export async function fetchSong(id: number, lang = 'ru'): Promise<Song | null> {
  const html = await fetchText(`${BASE}/${id}`);
  const { song } = parseSongPage(html, { id, lang });
  return song.text.trim() ? song : null;
}
