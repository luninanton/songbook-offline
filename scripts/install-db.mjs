/**
 * Кладёт собранную базу в assets Android-проекта, чтобы приложение работало
 * сразу после установки, без интернета.
 *
 *   node scripts/install-db.mjs [--in=data/build/songs.db.gz]
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const source = resolve(arg('in', 'data/build/songs.db.gz'));
const targetDir = resolve('android/app/src/main/assets');
const target = resolve(targetDir, 'songs.db.gz');

if (!existsSync(source)) {
  console.error(`Нет файла базы: ${source}`);
  console.error('Сначала соберите базу: npm run db:build');
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);

const sizeMb = (file) => (statSync(file).size / 1e6).toFixed(1);
console.log(`База скопирована: ${source} (${sizeMb(source)} МБ) → ${target} (${sizeMb(target)} МБ)`);
