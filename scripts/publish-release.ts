/**
 * Публикация обновления в GitHub Releases (этап M6).
 *
 *   npx tsx scripts/publish-release.ts --version=2026-11-01 --repo=USER/holychords-offline
 *
 * Требуется авторизованный GitHub CLI (`gh auth login`) или переменная GH_TOKEN.
 * Загружает: songs.db.gz (полная база), delta-<версия>.json.gz и manifest.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const version = arg('version', new Date().toISOString().slice(0, 10));
const repo = arg('repo', '');
const dir = resolve(arg('dir', 'data/build'));

if (!repo) {
  console.error('Укажите репозиторий: --repo=USER/holychords-offline');
  process.exit(1);
}

const files = ['songs.db.gz', `delta-${version}.json.gz`, 'manifest.json']
  .map((name) => resolve(dir, name))
  .filter((file) => existsSync(file));

if (files.length === 0) {
  console.error(`В ${dir} нет файлов для публикации. Сначала: npm run db:build`);
  process.exit(1);
}

for (const file of files) {
  console.log(`  ${file} — ${(statSync(file).size / 1e6).toFixed(2)} МБ`);
}

try {
  execFileSync('gh', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('Не найден GitHub CLI. Установите: brew install gh && gh auth login');
  process.exit(1);
}

const tag = `v${version}`;
const notes = [
  `База песен от ${version}`,
  '',
  'Установите APK, затем в приложении: Настройки → Обновление → Проверить обновления.',
  'Адрес манифеста: https://github.com/' + repo + '/releases/latest/download/manifest.json',
].join('\n');

console.log(`Публикую релиз ${tag} в ${repo}…`);
execFileSync(
  'gh',
  [
    'release',
    'create',
    tag,
    ...files,
    '--repo',
    repo,
    '--title',
    `База ${version}`,
    '--notes',
    notes,
  ],
  { stdio: 'inherit' },
);

console.log(`\nГотово: https://github.com/${repo}/releases/tag/${tag}`);
