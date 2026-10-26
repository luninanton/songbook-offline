/**
 * Диагностика: действительно ли у песен нет аккордов на сайте.
 *
 *   npx tsx scripts/check-no-chords.ts --limit=10
 *
 * Берёт случайные песни с has_chords = 0 из собранной базы, заново скачивает
 * страницы и проверяет, есть ли в них аккордовые строки. Если сайт отдаёт аккорды,
 * а база их не видит — это ошибка парсера, а не свойство песни.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chordLines } from '../src/core/chords';
import { parseSongPage } from '../src/core/parser';

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main(): Promise<void> {
  const dbPath = resolve(arg('db', 'data/build/songs.db'));
  const limit = Number.parseInt(arg('limit', '8'), 10) || 8;

  if (!existsSync(dbPath)) throw new Error(`Нет базы: ${dbPath}`);

  const db = new Database(dbPath, { readonly: true });
  const total = (db.prepare('SELECT COUNT(*) AS c FROM songs WHERE has_chords = 0').get() as {
    c: number;
  }).c;
  const rows = db
    .prepare('SELECT id FROM songs WHERE has_chords = 0 ORDER BY random() LIMIT ?')
    .all(limit) as Array<{ id: number }>;
  db.close();

  console.log(`Песен без аккордов в базе: ${total}`);
  console.log(`Проверяю ${rows.length} случайных…`);

  let withChordsOnSite = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const response = await fetch(`https://holychords.pro/${row.id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'Accept-Language': 'ru' },
        signal: AbortSignal.timeout(30_000),
      });
      const html = await response.text();
      const { song } = parseSongPage(html, { id: row.id });
      const chordsOnSite = chordLines(song.text).length;
      if (chordsOnSite > 0) withChordsOnSite += 1;
      console.log(
        `  id=${row.id}: строк ${song.text.split('\n').length}, ` +
          `аккордовых строк на сайте ${chordsOnSite}, в базе has_chords=0`,
      );
    } catch {
      errors += 1;
      console.log(`  id=${row.id}: ошибка запроса`);
    }
  }

  console.log(`\nИтог: с аккордами на сайте ${withChordsOnSite} из ${rows.length}, ошибок ${errors}`);
  if (withChordsOnSite > 0) {
    console.log('Похоже на ошибку парсера — проверьте эти песни вручную.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Проверка прервана:', error);
  process.exitCode = 1;
});
