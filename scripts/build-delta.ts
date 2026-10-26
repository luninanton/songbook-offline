/**
 * Сборка дельта-пакета и манифеста обновления (этап M6).
 *
 *   npx tsx scripts/build-delta.ts \
 *     --old=data/raw/ru-2026-10-26.jsonl \
 *     --new=data/raw/ru.jsonl \
 *     --from=2026-10-26 --to=2026-11-01 \
 *     --out=data/build --base-url=https://github.com/USER/REPO/releases/download/v2026-11-01
 *
 * Что делает:
 *  - сравнивает два снимка по id и хэшу текста;
 *  - пишет delta-<версия>.json.gz (только новые/изменённые песни + список удалённых);
 *  - пишет manifest.json со ссылками на полную базу и дельту, размерами и sha256.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Song } from '../src/core/types';
import type { DeltaPack, UpdateManifest } from '../src/core/update';

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function readIndex(file: string): Promise<Map<number, Song>> {
  if (!existsSync(file)) throw new Error(`Нет файла: ${file}`);
  const songs = new Map<number, Song>();
  const reader = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    const song = JSON.parse(line) as Song;
    songs.set(song.id, song);
  }
  return songs;
}

function sha256File(file: string): Promise<string> {
  return new Promise((done, fail) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', fail)
      .on('end', () => done(hash.digest('hex')));
  });
}

async function main(): Promise<void> {
  const oldFile = resolve(arg('old', 'data/raw/ru-prev.jsonl'));
  const newFile = resolve(arg('new', 'data/raw/ru.jsonl'));
  const fromVersion = arg('from', '');
  const toVersion = arg('to', new Date().toISOString().slice(0, 10));
  const outDir = resolve(arg('out', 'data/build'));
  const baseUrl = arg('base-url', '');

  if (!fromVersion) throw new Error('Укажите версию, от которой считается дельта: --from=2026-10-26');

  console.log(`Старый снимок: ${oldFile}`);
  const oldSongs = await readIndex(oldFile);
  console.log(`Новый снимок: ${newFile}`);
  const newSongs = await readIndex(newFile);

  const changed: Song[] = [];
  const added: number[] = [];
  const updated: number[] = [];

  for (const [id, song] of newSongs) {
    const previous = oldSongs.get(id);
    if (!previous) {
      added.push(id);
      changed.push(song);
    } else if (previous.hash !== song.hash) {
      updated.push(id);
      changed.push(song);
    }
  }

  const removed = [...oldSongs.keys()].filter((id) => !newSongs.has(id));

  console.log(`Новых: ${added.length}, изменённых: ${updated.length}, удалённых: ${removed.length}`);

  const pack: DeltaPack = { fromVersion, toVersion, songs: changed, removed };
  await mkdir(outDir, { recursive: true });
  const deltaName = `delta-${toVersion}.json.gz`;
  const deltaPath = resolve(outDir, deltaName);
  // В дельту попадают только изменения, поэтому сжимаем сериализованный пакет, а не весь снимок
  await writeFile(deltaPath, gzipSync(Buffer.from(JSON.stringify(pack), 'utf8'), { level: 9 }));

  const withChords = [...newSongs.values()].filter((song) => song.hasChords).length;
  const dbPath = resolve(outDir, 'songs.db.gz');
  const manifest: UpdateManifest = {
    schemaVersion: 1,
    dataVersion: toVersion,
    lang: 'ru',
    count: newSongs.size,
    withChords,
    builtAt: new Date().toISOString(),
    full: existsSync(dbPath)
      ? {
          name: 'songs.db.gz',
          url: baseUrl ? `${baseUrl}/songs.db.gz` : 'songs.db.gz',
          bytes: statSync(dbPath).size,
          sha256: await sha256File(dbPath),
        }
      : undefined,
    delta: {
      name: deltaName,
      url: baseUrl ? `${baseUrl}/${deltaName}` : deltaName,
      bytes: statSync(deltaPath).size,
      sha256: await sha256File(deltaPath),
      fromVersion,
    },
  };

  const manifestPath = resolve(outDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\nГотово:');
  console.log(`  ${deltaName}: ${(statSync(deltaPath).size / 1e6).toFixed(2)} МБ (${changed.length} песен)`);
  console.log(`  manifest.json: версия ${toVersion}, всего песен ${newSongs.size}`);
  if (!baseUrl) {
    console.log('  ссылки записаны без base-url — для публикации передайте --base-url=…');
  }
  console.log(`  каталог: ${dirname(manifestPath)}`);
}

main().catch((error) => {
  console.error('Сборка дельты прервана:', error);
  process.exitCode = 1;
});
