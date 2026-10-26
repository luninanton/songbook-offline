import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { normalizeForSearch } from '../core/normalize';
import type { DeltaPack } from '../core/update';
import type { Song } from '../core/types';

/**
 * Применение обновлений к локальной базе (этап M6).
 *
 * Используется INSERT OR REPLACE (а не UPSERT), потому что на Android 6.0
 * системный SQLite старее, чем поддержка `ON CONFLICT DO UPDATE`.
 * После записи FTS-индекс перестраивается командой 'rebuild' (FTS4).
 */
const DB_NAME = 'songs';

async function openDatabase() {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();
  return db;
}

const UPSERT_SQL = `
  INSERT OR REPLACE INTO songs
    (id, title, title_norm, artist, artist_norm, artist_id, album, album_id,
     key, text, has_chords, lang, published_at, modified_at, hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export interface ApplyResult {
  upserted: number;
  removed: number;
  total: number;
}

/** Применяет дельта-пакет: новые и изменённые песни + удаления */
export async function applyDelta(pack: DeltaPack): Promise<ApplyResult> {
  const db = await openDatabase();

  const set: Array<{ statement: string; values: unknown[] }> = [];
  for (const song of pack.songs) {
    set.push({
      statement: UPSERT_SQL,
      values: [
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
      ],
    });
  }
  for (const id of pack.removed) {
    set.push({ statement: 'DELETE FROM songs WHERE id = ?', values: [id] });
  }

  // executeSet с transaction=true применяет весь пакет атомарно
  if (set.length > 0) await db.executeSet(set, true);

  // Полное перестроение индекса: на 43k записей занимает несколько секунд,
  // зато не оставляет «мусора» от изменённых песен.
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

/** Добавляет в базу песни, найденные на сайте (без удалений) */
export async function upsertSongs(songs: Song[], dataVersion?: string): Promise<ApplyResult> {
  return applyDelta({
    fromVersion: '',
    toVersion: dataVersion ?? new Date().toISOString().slice(0, 10),
    songs,
    removed: [],
  });
}
