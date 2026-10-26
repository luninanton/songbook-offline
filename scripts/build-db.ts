/**
 * Сборка локальной базы songs.db (этап M2).
 *
 *   npm run db:build -- --in=data/raw/ru.jsonl --out=data/build/songs.db
 *
 * Схема рассчитана на нативный SQLite Android (FTS4, а не FTS5):
 *   songs      — карточка песни + оригинальный текст с аккордами;
 *   songs_fts  — FTS4 с внешним контентом (content='songs'), индекс без копии текста;
 *   meta       — версия данных, количество песен, дата сборки.
 */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { normalizeForSearch } from '../src/core/normalize';
import type { Song } from '../src/core/types';

const SCHEMA_VERSION = 1;

interface Options {
  input: string;
  out: string;
  lang: string;
  version: string;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string, fallback: string): string => {
    const prefix = `--${name}=`;
    const found = argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
  };
  return {
    input: resolve(get('in', 'data/raw/ru.jsonl')),
    out: resolve(get('out', 'data/build/songs.db')),
    lang: get('lang', 'ru'),
    version: get('version', new Date().toISOString().slice(0, 10)),
  };
}

async function readSongs(file: string): Promise<Map<number, Song>> {
  if (!existsSync(file)) throw new Error(`Нет файла с песнями: ${file}`);

  const songs = new Map<number, Song>();
  const reader = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let broken = 0;

  for await (const line of reader) {
    if (!line.trim()) continue;
    try {
      const song = JSON.parse(line) as Song;
      if (typeof song.id === 'number') songs.set(song.id, song);
    } catch {
      // обрыв записи (например, прерванный обход) — строку пропускаем
      broken += 1;
    }
  }

  if (broken > 0) console.warn(`Пропущено повреждённых строк: ${broken}`);
  return songs;
}

function sha256(file: string): Promise<string> {
  return new Promise((done, fail) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', fail)
      .on('end', () => done(hash.digest('hex')));
  });
}

const SCHEMA_SQL = `
  CREATE TABLE songs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    title_norm TEXT NOT NULL,
    artist TEXT NOT NULL,
    artist_norm TEXT NOT NULL,
    artist_id INTEGER,
    album TEXT,
    album_id INTEGER,
    key TEXT NOT NULL,
    text TEXT NOT NULL,
    has_chords INTEGER NOT NULL,
    lang TEXT NOT NULL,
    published_at TEXT,
    modified_at TEXT,
    hash TEXT NOT NULL
  );
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const INSERT_SQL = `
  INSERT INTO songs (id, title, title_norm, artist, artist_norm, artist_id, album, album_id,
                     key, text, has_chords, lang, published_at, modified_at, hash)
  VALUES (@id, @title, @title_norm, @artist, @artist_norm, @artist_id, @album, @album_id,
          @key, @text, @has_chords, @lang, @published_at, @modified_at, @hash)
`;


async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Читаю ${options.input}…`);
  const songs = await readSongs(options.input);
  console.log(`Песен: ${songs.size}`);
  if (songs.size === 0) throw new Error('Нет данных для сборки базы');

  await mkdir(dirname(options.out), { recursive: true });
  if (existsSync(options.out)) {
    const { unlink } = await import('node:fs/promises');
    await unlink(options.out);
  }

  const db = new Database(options.out);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');
  db.exec(SCHEMA_SQL);

  const insert = db.prepare(INSERT_SQL);
  const insertAll = db.transaction((items: Song[]) => {
    for (const song of items) {
      insert.run({
        id: song.id,
        title: song.title,
        title_norm: normalizeForSearch(song.title),
        artist: song.artist,
        artist_norm: normalizeForSearch(song.artist),
        artist_id: song.artistId,
        album: song.album,
        album_id: song.albumId,
        key: song.key,
        text: song.text,
        has_chords: song.hasChords ? 1 : 0,
        lang: song.lang,
        published_at: song.publishedAt,
        modified_at: song.modifiedAt,
        hash: song.hash,
      });
    }
  });
  insertAll([...songs.values()]);

  db.exec(`
    CREATE VIRTUAL TABLE songs_fts USING fts4(
      title_norm, artist_norm, text,
      content='songs',
      tokenize=unicode61
    );
    INSERT INTO songs_fts(docid, title_norm, artist_norm, text)
      SELECT id, title_norm, artist_norm, text FROM songs;
    CREATE INDEX idx_songs_title ON songs(title_norm);
    CREATE INDEX idx_songs_artist ON songs(artist_norm);
    CREATE INDEX idx_songs_has_chords ON songs(has_chords);
  `);

  const withChords = [...songs.values()].filter((song) => song.hasChords).length;
  const meta: Array<[string, string]> = [
    ['schema_version', String(SCHEMA_VERSION)],
    ['data_version', options.version],
    ['lang', options.lang],
    ['count', String(songs.size)],
    ['with_chords', String(withChords)],
    ['built_at', new Date().toISOString()],
  ];
  const insertMeta = db.prepare('INSERT INTO meta(key, value) VALUES(?, ?)');
  for (const [key, value] of meta) insertMeta.run(key, value);

  db.exec('ANALYZE');
  db.pragma('journal_mode = DELETE');
  db.exec('VACUUM');
  db.close();

  const dbBytes = statSync(options.out).size;
  const gzPath = `${options.out}.gz`;
  await pipeline(createReadStream(options.out), createGzip({ level: 9 }), createWriteStream(gzPath));

  const manifestPath = options.out.replace(/\.db$/, '') + '.manifest.json';
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: options.version,
    lang: options.lang,
    count: songs.size,
    withChords,
    builtAt: new Date().toISOString(),
    dbBytes,
    dbSha256: await sha256(options.out),
    gzBytes: statSync(gzPath).size,
    gzSha256: await sha256(gzPath),
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\nГотово:');
  console.log(`  песен: ${songs.size} (с аккордами ${withChords})`);
  console.log(`  база: ${(dbBytes / 1e6).toFixed(1)} МБ, архив: ${(manifest.gzBytes / 1e6).toFixed(1)} МБ`);
  console.log(`  manifest: ${manifestPath}`);

  // Самопроверка: целостность, счётчики и работоспособность FTS
  const check = new Database(options.out, { readonly: true });
  const integrity = (check.prepare('PRAGMA integrity_check').get() as { integrity_check: string })
    .integrity_check;
  const total = (check.prepare('SELECT COUNT(*) AS c FROM songs').get() as { c: number }).c;
  const ftsRows = (
    check.prepare('SELECT COUNT(*) AS c FROM songs_fts WHERE songs_fts MATCH ?').get('"а"*') as {
      c: number;
    }
  ).c;
  check.close();

  console.log(`  integrity_check: ${integrity}, songs: ${total}, FTS-строк: ${ftsRows}`);
  if (integrity !== 'ok') throw new Error('База повреждена: integrity_check ≠ ok');
  if (total !== songs.size) throw new Error('Количество строк не совпадает с числом песен');
  if (ftsRows === 0) throw new Error('FTS-индекс пуст');
}

main().catch((error) => {
  console.error('Сборка базы прервана:', error);
  process.exitCode = 1;
});

