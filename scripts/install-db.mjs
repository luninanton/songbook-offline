/**
 * Кладёт собранную базу в assets Android-проекта, чтобы приложение работало
 * сразу после установки, без интернета.
 *
 *   node scripts/install-db.mjs [--in=data/build/songs.db]
 *
 * В APK файл кладётся как assets/songs.db: Android Gradle Plugin сам распаковывает
 * .gz-ассеты при упаковке, поэтому сжатый вариант всё равно превращается в обычный файл.
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const source = resolve(arg('in', 'data/build/songs.db'));
const targetDir = resolve('android/app/src/main/assets');
const target = resolve(targetDir, 'songs.db');

if (!existsSync(source)) {
  console.error(`Нет файла базы: ${source}`);
  console.error('Сначала соберите базу: npm run db:build');
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);

// номер схемы базы: по нему приложение понимает, что старую базу надо заменить
const schemaSource = source.replace(/\.db$/, '.schema');
if (existsSync(schemaSource)) {
  copyFileSync(schemaSource, resolve(targetDir, 'songs.schema'));
} else {
  writeFileSync(resolve(targetDir, 'songs.schema'), '1');
}

const sizeMb = (file) => (statSync(file).size / 1e6).toFixed(1);
console.log(`База скопирована: ${source} (${sizeMb(source)} МБ) → ${target} (${sizeMb(target)} МБ)`);
console.log('Не забудьте: npm run android:apk');
