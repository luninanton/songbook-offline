import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { normalizeForSearch } from '../core/normalize';
import type { DeltaPack } from '../core/update';
import type { Song } from '../core/types';

/**
 * Запись обновлений в SQLite.
 *
 * Работаем через уже открытое соединение репозитория: плагин SQLite не позволяет
 * открыть второе соединение с тем же именем («Connection … already exists»),
 * а retrieveConnection для него же отвечает «does not exist».
 */
export interface ApplyResult {
  upserted: number;
  removed: number;
  total: number;
}

// INSERT OR REPLACE вместо UPSERT: на Android 6.0 системный SQLite старше ON CONFLICT DO UPDATE
const UPSERT_SQL = `
  INSERT OR REPLACE INTO songs
    (id, title, title_norm, artist, artist_norm, artist_id, album, album_id,
     key, text, has_chords, lang, published_at, modified_at, hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function toParams(song: Song): unknown[] {
  return [
    song.id,
    song.title,
    normalizeForSearch(song.title),
    song.artist,
    normalizeForSearch(song.artist),
    song.artistId,
    song.album,
    song.albumId,
    song.key,
    song.text,
    song.hasChords ? 1 : 0,
    song.lang,
    song.publishedAt,
    song.modifiedAt,
    song.hash,
  ];
}

/** Применяет дельта-пакет к открытой базе: песни + удаления + пересборка FTS */
export async function applyDeltaTo(db: SQLiteDBConnection, pack: DeltaPack): Promise<ApplyResult> {
  const set: Array<{ statement: string; values: unknown[] }> = [];
  for (const song of pack.songs) set.push({ statement: UPSERT_SQL, values: toParams(song) });
  for (const id of pack.removed) {
    set.push({ statement: 'DELETE FROM songs WHERE id = ?', values: [id] });
  }

  // executeSet с transaction=true применяет пакет атомарно
  if (set.length > 0) await db.executeSet(set, true);

  // Полная пересборка индекса: несколько секунд на 43k, зато без «мусора» от изменённых песен
  await db.execute("INSERT INTO songs_fts(songs_fts) VALUES('rebuild')");

  const totalResult = await db.query('SELECT COUNT(*) AS c FROM songs');
  const total = Number(((totalResult.values ?? [])[0] as { c: number } | undefined)?.c ?? 0);

  await db.run('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)', ['count', String(total)]);
  await db.run('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)', [
    'data_version',
    pack.toVersion,
  ]);
  await db.run('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)', [
    'updated_at',
    new Date().toISOString(),
  ]);

  return { upserted: pack.songs.length, removed: pack.removed.length, total };
}
