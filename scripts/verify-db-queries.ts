/**
 * Проверка SQL-запросов приложения на реальной базе (до запуска на устройстве).
 *
 *   npx tsx scripts/verify-db-queries.ts --db=data/build/songs.db
 *
 * Использует те же запросы, что src/db/native.ts (общий модуль src/db/queries.ts),
 * и тот же SQLite (better-sqlite3), что и на десктопе. Android-овский SQLite
 * читает этот файл так же — FTS4 и unicode61 поддерживаются на всех версиях.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { toFtsQuery } from '../src/core/normalize';
import {
  buildCountFts,
  buildCountPlain,
  buildSearchFts,
  buildSearchPlain,
  GET_SONG_SQL,
  MAX_ID_SQL,
  META_SQL,
  orderByClause,
} from '../src/db/queries';

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const dbPath = resolve(arg('db', 'data/build/songs.db'));
if (!existsSync(dbPath)) {
  console.error(`Нет базы: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const failures: string[] = [];

function check(name: string, condition: boolean, details: string): void {
  console.log(`${condition ? '✓' : '✗'} ${name}: ${details}`);
  if (!condition) failures.push(name);
}

function timing<T>(fn: () => T): { value: T; ms: number } {
  const start = process.hrtime.bigint();
  const value = fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { value, ms };
}

// 1. Метаданные
const meta = timing(() => db.prepare(META_SQL).all() as Array<{ key: string; value: string }>);
const metaMap = new Map(meta.value.map((row) => [row.key, row.value]));
check('meta', meta.value.length > 0, `ключей ${meta.value.length}, версия ${metaMap.get('data_version')}`);

// 2. Максимальный id
const maxId = timing(() => (db.prepare(MAX_ID_SQL).get() as { maxId: number }).maxId);
check('maxId', maxId.value > 0, `${maxId.value}, ${maxId.ms.toFixed(1)} мс`);

// 3. Список без поиска
const plainList = buildSearchPlain(orderByClause('new', false), 20, 0);
const plain = timing(() => db.prepare(plainList.sql).all(...(plainList.params as never[])) as Array<Record<string, unknown>>);
check('список', plain.value.length > 0, `${plain.value.length} строк, ${plain.ms.toFixed(1)} мс`);

const plainCount = buildCountPlain();
const total = timing(() => (db.prepare(plainCount.sql).get() as { c: number }).c);
check('всего песен', total.value > 0, `${total.value}`);

// 4. Избранное — фильтр по списку id
const favorites = plain.value.slice(0, 2).map((row) => Number(row.id));
const favList = buildSearchPlain(orderByClause('title', false), 20, 0, favorites);
const favRows = db.prepare(favList.sql).all(...(favList.params as never[])) as Array<Record<string, unknown>>;
check('избранное', favRows.length === favorites.length, `${favRows.length} из ${favorites.length}`);

// 5. Полнотекстовый поиск по частому символу + по слову из названия
const firstTitle = String(plain.value[0]?.title ?? '');
const word = firstTitle.split(/\s+/).find((token) => token.length >= 4) ?? firstTitle.slice(0, 4);
const ftsQuery = toFtsQuery(word);
const ftsList = buildSearchFts(ftsQuery, orderByClause('new', true), 20, 0);
const fts = timing(() => db.prepare(ftsList.sql).all(...(ftsList.params as never[])) as Array<Record<string, unknown>>);
check('поиск FTS', fts.value.length > 0, `«${word}» → ${fts.value.length} строк, ${fts.ms.toFixed(2)} мс`);

const ftsCount = buildCountFts(ftsQuery);
const ftsTotal = (db.prepare(ftsCount.sql).get(...(ftsCount.params as never[])) as { c: number }).c;
check('счётчик FTS', ftsTotal >= fts.value.length, `${ftsTotal}`);

// 6. Поиск по названию + избранное одновременно
const ftsFav = buildSearchFts(ftsQuery, orderByClause('title', true), 20, 0, favorites);
const ftsFavRows = db.prepare(ftsFav.sql).all(...(ftsFav.params as never[])) as Array<Record<string, unknown>>;
check('FTS + избранное', Array.isArray(ftsFavRows), `${ftsFavRows.length} строк`);

// 7. Чтение одной песни
const songId = Number(plain.value[0]?.id ?? 0);
const song = timing(() => db.prepare(GET_SONG_SQL).get(songId) as Record<string, unknown> | undefined);
const hasText = typeof song.value?.text === 'string' && (song.value.text as string).length > 0;
check('песня по id', Boolean(song.value) && hasText, `id=${songId}, ${song.ms.toFixed(2)} мс, полей ${Object.keys(song.value ?? {}).length}`);

// 8. Целостность
const integrity = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
check('integrity_check', integrity === 'ok', integrity);

db.close();

if (failures.length > 0) {
  console.error(`\nПровалены проверки: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('\nВсе проверки пройдены');
}
