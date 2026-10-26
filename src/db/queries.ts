/**
 * SQL-запросы приложения в одном месте: их использует и нативный репозиторий,
 * и скрипт проверки на обычном SQLite (scripts/verify-db-queries.ts).
 * Так запросы проверяются до запуска на устройстве.
 */
export function placeholders(count: number): string {
  return count > 0 ? Array.from({ length: count }, () => '?').join(',') : 'NULL';
}

export interface SqlParts {
  sql: string;
  /** Порядок параметров важен: он описан в doc-комментарии функции */
  params: unknown[];
}

export function buildSearchFts(
  ftsQuery: string,
  orderBy: string,
  limit: number,
  offset: number,
  favorites?: number[],
): SqlParts {
  const filter = favorites ? `AND s.id IN (${placeholders(favorites.length)})` : '';
  return {
    sql: `SELECT s.id, s.title, s.artist, s.album, s.key, s.has_chords
          FROM songs_fts f JOIN songs s ON s.id = f.docid
          WHERE songs_fts MATCH ? ${filter}
          ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    params: [ftsQuery, ...(favorites ?? []), limit, offset],
  };
}

export function buildCountFts(ftsQuery: string, favorites?: number[]): SqlParts {
  const filter = favorites ? `AND s.id IN (${placeholders(favorites.length)})` : '';
  return {
    sql: `SELECT COUNT(*) AS c FROM songs_fts f JOIN songs s ON s.id = f.docid
          WHERE songs_fts MATCH ? ${filter}`,
    params: [ftsQuery, ...(favorites ?? [])],
  };
}

export function buildSearchPlain(
  orderBy: string,
  limit: number,
  offset: number,
  favorites?: number[],
): SqlParts {
  const filter = favorites ? `WHERE id IN (${placeholders(favorites.length)})` : '';
  return {
    sql: `SELECT id, title, artist, album, key, has_chords FROM songs ${filter}
          ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    params: [...(favorites ?? []), limit, offset],
  };
}

export function buildCountPlain(favorites?: number[]): SqlParts {
  const filter = favorites ? `WHERE id IN (${placeholders(favorites.length)})` : '';
  return {
    sql: `SELECT COUNT(*) AS c FROM songs ${filter}`,
    params: [...(favorites ?? [])],
  };
}

export const GET_SONG_SQL =
  'SELECT id, title, artist, album, key, has_chords, text FROM songs WHERE id = ?';

export const MAX_ID_SQL = 'SELECT MAX(id) AS maxId FROM songs';

export const ALL_HASHES_SQL = 'SELECT id, hash FROM songs';

export const META_SQL = 'SELECT key, value FROM meta';

export const UPSERT_SONG_SQL = `
  INSERT OR REPLACE INTO songs
    (id, title, title_norm, artist, artist_norm, artist_id, album, album_id,
     key, text, has_chords, lang, published_at, modified_at, hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const REBUILD_FTS_SQL = "INSERT INTO songs_fts(songs_fts) VALUES('rebuild')";

export function orderByClause(sort: 'new' | 'popular' | 'title' | undefined, prefixed: boolean): string {
  const prefix = prefixed ? 's.' : '';
  switch (sort) {
    case 'title':
      return `${prefix}title_norm ASC`;
    case 'popular':
    case 'new':
    default:
      return `${prefix}id DESC`;
  }
}
