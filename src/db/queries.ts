import { normalizeForSearch } from '../core/normalize';

/**
 * SQL-запросы приложения в одном месте: их использует и нативный репозиторий,
 * и скрипт проверки на обычном SQLite (scripts/verify-db-queries.ts).
 */
export interface SearchFilters {
  /** Ограничить список этими id (избранное) */
  favorites?: number[];
  /** Только песни, у которых есть аккорды */
  hasChordsOnly?: boolean;
}

export function placeholders(count: number): string {
  return count > 0 ? Array.from({ length: count }, () => '?').join(',') : 'NULL';
}

function filterParams(filters: SearchFilters): unknown[] {
  return filters.favorites ? [...filters.favorites] : [];
}

function ftsFilterSql(filters: SearchFilters): string {
  let sql = '';
  if (filters.favorites) sql += ` AND s.id IN (${placeholders(filters.favorites.length)})`;
  if (filters.hasChordsOnly) sql += ' AND s.has_chords = 1';
  return sql;
}

function plainFilterSql(filters: SearchFilters): string {
  const parts: string[] = [];
  if (filters.favorites) parts.push(`id IN (${placeholders(filters.favorites.length)})`);
  if (filters.hasChordsOnly) parts.push('has_chords = 1');
  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

export interface SqlParts {
  sql: string;
  params: unknown[];
}

export function buildSearchFts(
  ftsQuery: string,
  orderBy: string,
  limit: number,
  offset: number,
  filters: SearchFilters = {},
): SqlParts {
  return {
    sql: `SELECT s.id, s.title, s.artist, s.album, s.key, s.has_chords
          FROM songs_fts f JOIN songs s ON s.id = f.docid
          WHERE songs_fts MATCH ?${ftsFilterSql(filters)}
          ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    params: [ftsQuery, ...filterParams(filters), limit, offset],
  };
}

export function buildCountFts(ftsQuery: string, filters: SearchFilters = {}): SqlParts {
  return {
    sql: `SELECT COUNT(*) AS c FROM songs_fts f JOIN songs s ON s.id = f.docid
          WHERE songs_fts MATCH ?${ftsFilterSql(filters)}`,
    params: [ftsQuery, ...filterParams(filters)],
  };
}

export function buildSearchPlain(
  orderBy: string,
  limit: number,
  offset: number,
  filters: SearchFilters = {},
): SqlParts {
  return {
    sql: `SELECT id, title, artist, album, key, has_chords FROM songs ${plainFilterSql(filters)}
          ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    params: [...filterParams(filters), limit, offset],
  };
}

export function buildCountPlain(filters: SearchFilters = {}): SqlParts {
  return {
    sql: `SELECT COUNT(*) AS c FROM songs ${plainFilterSql(filters)}`,
    params: filterParams(filters),
  };
}

export const GET_SONG_SQL =
  "SELECT id, origin, title, artist, album, key, has_chords, text FROM songs WHERE id = ?";

export const MAX_ID_SQL = 'SELECT MAX(id) AS maxId FROM songs';

// Свои песни (origin='user') не участвуют в сверке с сайтом
export const ALL_HASHES_SQL = "SELECT id, hash FROM songs WHERE origin = 'site'";

export const META_SQL = 'SELECT key, value FROM meta';

export const FIND_BY_TITLE_SQL =
  'SELECT id, title, artist, album, key, has_chords FROM songs WHERE title_norm = ? LIMIT 1';

// Свои песни живут в диапазоне от 1 000 000, чтобы не пересечься с id сайта
export const NEXT_USER_ID_SQL =
  'SELECT COALESCE(MAX(id), 1000000) + 1 AS nextId FROM songs WHERE id >= 1000000';

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

/**
 * Сортировка результатов поиска: сначала песни, у которых совпало название,
 * потом остальные (куплеты, припевы). Иначе выдача выглядит случайной.
 */
export function buildOrderWithTitlePriority(
  sort: 'new' | 'popular' | 'title' | undefined,
  query: string,
): { sql: string; params: unknown[] } {
  const titlePriority = 'CASE WHEN s.title_norm LIKE ? THEN 0 ELSE 1 END';
  return {
    sql: `${titlePriority}, ${orderByClause(sort, true)}`,
    params: [`%${normalizeForSearch(query)}%`],
  };
}
