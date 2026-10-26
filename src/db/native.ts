import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type {
  DbMeta,
  NewSongInput,
  SongFull,
  SongPage,
  SongQuery,
  SongRepository,
  WriteResult,
} from './types';
import { buildFtsQueries } from '../core/normalize';
import type { DeltaPack } from '../core/update';
import type { Song } from '../core/types';
import { hasChords } from '../core/chords';
import { hashText } from '../core/hash';
import { applyDeltaTo } from './updater';
import {
  ALL_HASHES_SQL,
  buildCountFts,
  buildCountPlain,
  buildOrderWithTitlePriority,
  buildSearchFts,
  buildSearchPlain,
  GET_SONG_SQL,
  MAX_ID_SQL,
  META_SQL,
  NEXT_USER_ID_SQL,
  REBUILD_FTS_SQL,
  orderByClause,
} from './queries';

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
    const result = await db.query(META_SQL);
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
    const filters = {
      favorites: params.favoritesOnly ? (params.favorites ?? []) : undefined,
      hasChordsOnly: params.hasChordsOnly,
    };

    if (query) {
      // Сначала строгий запрос (все слова), затем мягкий (любое из слов)
      for (const ftsQuery of buildFtsQueries(query)) {
        const orderBy = buildOrderWithTitlePriority(params.sort, query);
        const list = buildSearchFts(ftsQuery, orderBy.sql, limit, offset, filters);
        const rows = await db.query(list.sql, [...orderBy.params, ...list.params]);
        if ((rows.values ?? []).length > 0) {
          const count = buildCountFts(ftsQuery, filters);
          const total = await db.query(count.sql, count.params);
          return {
            items: ((rows.values ?? []) as SongRecord[]).map(mapRow),
            total: Number(((total.values ?? [])[0] as { c: number } | undefined)?.c ?? 0),
          };
        }
      }

      return { items: [], total: 0 };
    }

    const list = buildSearchPlain(orderByClause(params.sort, false), limit, offset, filters);
    const count = buildCountPlain(filters);
    const rows = await db.query(list.sql, list.params);
    const total = await db.query(count.sql, count.params);
    return {
      items: ((rows.values ?? []) as SongRecord[]).map(mapRow),
      total: Number(((total.values ?? [])[0] as { c: number } | undefined)?.c ?? 0),
    };
  }

  async get(id: number): Promise<SongFull | null> {
    const db = await this.database();
    const result = await db.query(GET_SONG_SQL, [id]);
    const row =
      ((result.values ?? [])[0] as (SongRecord & { text: string; origin: string }) | undefined) ??
      null;
    if (!row) return null;
    return { ...mapRow(row), text: row.text, origin: row.origin === 'user' ? 'user' : 'site' };
  }

  async addSong(input: NewSongInput): Promise<number> {
    const db = await this.database();
    const next = await db.query(NEXT_USER_ID_SQL);
    const id = Number(((next.values ?? [])[0] as { nextId: number } | undefined)?.nextId ?? 1_000_001);

    const text = input.text.replace(/\r\n?/g, '\n').trimEnd();
    const song: Song = {
      id,
      origin: 'user',
      title: input.title.trim() || 'Без названия',
      artist: input.artist.trim() || 'Своя песня',
      artistId: null,
      album: null,
      albumId: null,
      key: input.key.trim(),
      text,
      hasChords: hasChords(text),
      lang: 'ru',
      publishedAt: null,
      modifiedAt: new Date().toISOString(),
      hash: hashText(`${input.key}\n${text}`),
    };

    await applyDeltaTo(db, {
      fromVersion: '',
      toVersion: new Date().toISOString().slice(0, 10),
      songs: [song],
      removed: [],
    }, { updateMeta: false });

    return id;
  }

  async saveUserSong(song: Song): Promise<void> {
    const db = await this.database();
    await applyDeltaTo(
      db,
      { fromVersion: '', toVersion: '', songs: [{ ...song, origin: 'user' }], removed: [] },
      { updateMeta: false },
    );
  }

  async deleteSong(id: number): Promise<void> {
    const db = await this.database();
    await db.run("DELETE FROM songs WHERE id = ? AND origin = 'user'", [id]);
    await db.execute(REBUILD_FTS_SQL);
    const total = await db.query('SELECT COUNT(*) AS c FROM songs');
    const count = Number(((total.values ?? [])[0] as { c: number } | undefined)?.c ?? 0);
    await db.run('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)', ['count', String(count)]);
  }

  async maxId(): Promise<number> {
    const db = await this.database();
    const result = await db.query(MAX_ID_SQL);
    return Number(((result.values ?? [])[0] as { maxId: number } | undefined)?.maxId ?? 0);
  }

  async allHashes(): Promise<Map<number, string>> {
    const db = await this.database();
    const result = await db.query(ALL_HASHES_SQL);
    const hashes = new Map<number, string>();
    for (const row of (result.values ?? []) as Array<{ id: number; hash: string }>) {
      hashes.set(Number(row.id), row.hash);
    }
    return hashes;
  }

  async writeDelta(pack: DeltaPack): Promise<WriteResult> {
    const db = await this.database();
    return applyDeltaTo(db, pack);
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
