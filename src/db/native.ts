import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { DbMeta, SongFull, SongPage, SongQuery, SongRepository, WriteResult } from './types';
import { toFtsQuery } from '../core/normalize';
import type { DeltaPack } from '../core/update';
import { applyDeltaTo } from './updater';
import {
  ALL_HASHES_SQL,
  buildCountFts,
  buildCountPlain,
  buildSearchFts,
  buildSearchPlain,
  GET_SONG_SQL,
  MAX_ID_SQL,
  META_SQL,
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
    const ftsQuery = query ? toFtsQuery(query) : '';
    const favorites = params.favoritesOnly ? (params.favorites ?? []) : undefined;

    if (ftsQuery) {
      const list = buildSearchFts(ftsQuery, orderByClause(params.sort, true), limit, offset, favorites);
      const count = buildCountFts(ftsQuery, favorites);
      const rows = await db.query(list.sql, list.params);
      const total = await db.query(count.sql, count.params);
      return {
        items: ((rows.values ?? []) as SongRecord[]).map(mapRow),
        total: Number(((total.values ?? [])[0] as { c: number } | undefined)?.c ?? 0),
      };
    }

    const list = buildSearchPlain(orderByClause(params.sort, false), limit, offset, favorites);
    const count = buildCountPlain(favorites);
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
    const row = ((result.values ?? [])[0] as (SongRecord & { text: string }) | undefined) ?? null;
    if (!row) return null;
    return { ...mapRow(row), text: row.text };
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
