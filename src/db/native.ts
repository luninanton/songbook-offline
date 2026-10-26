import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { DbMeta, SongFull, SongPage, SongQuery, SongRepository } from './types';
import { toFtsQuery } from '../core/normalize';

/**
 * Нативная база на устройстве (этап M5: файл songs.db распаковывается из assets
 * в databases/ при первом запуске, см. src/db/bootstrap.ts).
 */
const DB_NAME = 'songs';

interface SongRecord {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  key: string;
  has_chords: number;
}

export class NativeRepository implements SongRepository {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: Awaited<ReturnType<SQLiteConnection['createConnection']>> | null = null;

  async ready(): Promise<void> {
    if (this.db) return;
    this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await this.db.open();
  }

  private async database() {
    await this.ready();
    if (!this.db) throw new Error('База не открыта');
    return this.db;
  }

  async meta(): Promise<DbMeta> {
    const db = await this.database();
    const result = await db.query('SELECT key, value FROM meta');
    const values = new Map<string, string>();
    for (const row of (result.values ?? []) as Array<{ key: string; value: string }>) {
      values.set(row.key, row.value);
    }
    return {
      count: Number(values.get('count') ?? 0),
      withChords: Number(values.get('with_chords') ?? 0),
      dataVersion: values.get('data_version') ?? '—',
      builtAt: values.get('built_at') ?? '—',
    };
  }

  async search(params: SongQuery): Promise<SongPage> {
    const db = await this.database();
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    const query = (params.query ?? '').trim();
    const ftsQuery = query ? toFtsQuery(query) : '';
    const favorites = params.favorites ?? [];
    const favoritesFilter = params.favoritesOnly
      ? `AND s.id IN (${favorites.length > 0 ? favorites.map(() => '?').join(',') : 'NULL'})`
      : '';

    if (ftsQuery) {
      const values: unknown[] = [ftsQuery, ...(params.favoritesOnly ? favorites : []), limit, offset];
      const result = await db.query(
        `SELECT s.id, s.title, s.artist, s.album, s.key, s.has_chords
         FROM songs_fts f JOIN songs s ON s.id = f.docid
         WHERE songs_fts MATCH ? ${favoritesFilter}
         ORDER BY ${orderBy(params)} LIMIT ? OFFSET ?`,
        values,
      );
      const countValues: unknown[] = [ftsQuery, ...(params.favoritesOnly ? favorites : [])];
      const total = await db.query(
        `SELECT COUNT(*) AS c FROM songs_fts f JOIN songs s ON s.id = f.docid
         WHERE songs_fts MATCH ? ${favoritesFilter}`,
        countValues,
      );
      return {
        items: ((result.values ?? []) as SongRecord[]).map(mapRow),
        total: Number(((total.values ?? [])[0] as { c: number } | undefined)?.c ?? 0),
      };
    }

    const where = params.favoritesOnly
      ? `WHERE id IN (${favorites.length > 0 ? favorites.map(() => '?').join(',') : 'NULL'})`
      : '';
    const listValues: unknown[] = [...(params.favoritesOnly ? favorites : []), limit, offset];
    const result = await db.query(
      `SELECT id, title, artist, album, key, has_chords FROM songs ${where}
       ORDER BY ${orderBy(params)} LIMIT ? OFFSET ?`,
      listValues,
    );
    const total = await db.query(
      `SELECT COUNT(*) AS c FROM songs ${where}`,
      params.favoritesOnly ? favorites : [],
    );
    return {
      items: ((result.values ?? []) as SongRecord[]).map(mapRow),
      total: Number(((total.values ?? [])[0] as { c: number } | undefined)?.c ?? 0),
    };
  }

  async get(id: number): Promise<SongFull | null> {
    const db = await this.database();
    const result = await db.query(
      'SELECT id, title, artist, album, key, has_chords, text FROM songs WHERE id = ?',
      [id],
    );
    const row = ((result.values ?? [])[0] as (SongRecord & { text: string }) | undefined) ?? null;
    if (!row) return null;
    return { ...mapRow(row), text: row.text };
  }
}

function orderBy(params: SongQuery): string {
  switch (params.sort) {
    case 'title':
      return 's.title_norm ASC';
    case 'popular':
      return 's.id DESC';
    default:
      return 's.id DESC';
  }
}

function mapRow(row: SongRecord) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    key: row.key,
    hasChords: Boolean(row.has_chords),
  };
}
