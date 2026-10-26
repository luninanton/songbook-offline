/**
 * Краулер holychords.pro (этап M1).
 *
 * Использование:
 *   npm run crawl -- --lang=ru --list-only            # собрать список id
 *   npm run crawl -- --lang=ru --limit=500            # пробный прогон
 *   npm run crawl -- --lang=ru                        # полный обход
 *
 * Принципы: один запрос на песню, пауза между запросами, повторы с backoff,
 * кэш сырого HTML (gzip) и файл состояния — обход можно прерывать и продолжать.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ParseError, parseSongPage } from '../src/core/parser';
import type { LangCode } from '../src/core/types';
import type { CrawlState } from '../src/core/state';

const BASE = 'https://holychords.pro';
const USER_AGENT = 'HolychordsOffline/0.1 (personal offline reader; 1 request per page)';

const SITE_ID_BY_LANG: Record<LangCode, string> = {
  ru: '2',
  uk: '3',
  en: '4',
  other: '2',
};

interface Options {
  lang: LangCode;
  limit: number;
  concurrency: number;
  delayMs: number;
  out: string;
  stateFile: string;
  idsFile: string;
  cacheDir: string;
  listOnly: boolean;
  refreshIds: boolean;
  maxPages: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const found = argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);

  const lang = (get('lang') ?? 'ru') as LangCode;
  if (!(lang in SITE_ID_BY_LANG)) {
    throw new Error(`Неизвестный язык: ${lang}. Доступно: ${Object.keys(SITE_ID_BY_LANG).join(', ')}`);
  }

  return {
    lang,
    limit: Number.parseInt(get('limit') ?? '0', 10) || 0,
    concurrency: Number.parseInt(get('concurrency') ?? '4', 10) || 4,
    delayMs: Number.parseInt(get('delay') ?? '150', 10),
    out: resolve(get('out') ?? `data/raw/${lang}.jsonl`),
    stateFile: resolve(get('state') ?? `data/build/${lang}.state.json`),
    idsFile: resolve(get('ids') ?? `data/build/${lang}-ids.json`),
    cacheDir: resolve(get('cache') ?? 'data/cache'),
    listOnly: has('list-only'),
    refreshIds: has('refresh-ids'),
    maxPages: Number.parseInt(get('max-pages') ?? '2000', 10) || 2000,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function fetchHtml(url: string): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru,en;q=0.8',
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (response.status === 404) throw new ParseError('404', 'not_found');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      return await response.text();
    } catch (error) {
      lastError = error;
      if (error instanceof ParseError) throw error;
      await sleep(800 * attempt * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Собирает id песен из списка /lang/N?page=… */
async function collectIds(options: Options): Promise<number[]> {
  const siteLangId = SITE_ID_BY_LANG[options.lang];
  const ids = new Set<number>();
  let emptyPagesInRow = 0;

  for (let page = 1; page <= options.maxPages; page += 1) {
    const html = await fetchHtml(`${BASE}/lang/${siteLangId}?page=${page}`);
    const found = [...html.matchAll(/href="\/(\d{3,6})"/g)]
      .map((match) => Number.parseInt(match[1] as string, 10))
      .filter((id) => Number.isFinite(id));

    const before = ids.size;
    for (const id of found) ids.add(id);
    const added = ids.size - before;

    if (page % 25 === 0 || page === 1) {
      console.log(`  список: страница ${page}, всего id ${ids.size}`);
    }

    if (added === 0) {
      emptyPagesInRow += 1;
      if (emptyPagesInRow >= 2) break;
    } else {
      emptyPagesInRow = 0;
    }

    await sleep(options.delayMs);
  }

  return [...ids].sort((a, b) => a - b);
}

async function loadIds(options: Options): Promise<number[]> {
  if (!options.refreshIds && existsSync(options.idsFile)) {
    const cached = JSON.parse(await readFile(options.idsFile, 'utf8')) as { ids: number[] };
    console.log(`Список id из кэша: ${cached.ids.length}`);
    return cached.ids;
  }

  console.log(`Собираю список id для языка ${options.lang}…`);
  const ids = await collectIds(options);
  await mkdir(dirname(options.idsFile), { recursive: true });
  await writeFile(options.idsFile, JSON.stringify({ lang: options.lang, ids }), 'utf8');
  console.log(`Список id сохранён: ${ids.length}`);
  return ids;
}


async function loadState(options: Options): Promise<CrawlState> {
  if (existsSync(options.stateFile)) {
    return JSON.parse(await readFile(options.stateFile, 'utf8')) as CrawlState;
  }
  return { version: 1, lang: options.lang, done: [], failed: {}, updatedAt: new Date().toISOString() };
}

async function saveState(options: Options, state: CrawlState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await mkdir(dirname(options.stateFile), { recursive: true });
  await writeFile(options.stateFile, JSON.stringify(state), 'utf8');
}

function cachePath(options: Options, id: number): string {
  return resolve(options.cacheDir, `${id}.html.gz`);
}

async function readCachedHtml(options: Options, id: number): Promise<string | null> {
  const file = cachePath(options, id);
  if (!existsSync(file)) return null;
  return gunzipSync(await readFile(file)).toString('utf8');
}

async function writeCachedHtml(options: Options, id: number, html: string): Promise<void> {
  const file = cachePath(options, id);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, gzipSync(html));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `Язык: ${options.lang} (site lang ${SITE_ID_BY_LANG[options.lang]}), ` +
      `лимит: ${options.limit || 'без лимита'}, потоков: ${options.concurrency}, пауза: ${options.delayMs} мс`,
  );

  const ids = await loadIds(options);
  if (options.listOnly) {
    console.log(`Готово: ${ids.length} id. Первые: ${ids.slice(0, 10).join(', ')}`);
    return;
  }

  const state = await loadState(options);
  const done = new Set(state.done);
  const queue = ids.filter((id) => !done.has(id)).slice(0, options.limit || undefined);

  console.log(`К обработке: ${queue.length} (уже сделано: ${done.size})`);
  await mkdir(dirname(options.out), { recursive: true });

  const warningCounts = new Map<string, number>();
  const stats = { ok: 0, failed: 0, noChords: 0, bytes: 0 };
  let cursor = 0;
  let processed = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const id = queue[index];
      if (id === undefined) return;

      try {
        let html = await readCachedHtml(options, id);
        if (html === null) {
          html = await fetchHtml(`${BASE}/${id}`);
          await writeCachedHtml(options, id, html);
        }

        const { song, warnings } = parseSongPage(html, { id, lang: options.lang });
        await appendFile(options.out, `${JSON.stringify(song)}\n`, 'utf8');

        stats.ok += 1;
        stats.bytes += song.text.length;
        if (!song.hasChords) stats.noChords += 1;
        for (const warning of warnings) {
          warningCounts.set(warning, (warningCounts.get(warning) ?? 0) + 1);
        }

        state.done.push(id);
      } catch (error) {
        stats.failed += 1;
        const reason =
          error instanceof ParseError
            ? error.reason
            : error instanceof Error
              ? error.message
              : String(error);
        state.failed[String(id)] = reason;
        console.warn(`  ! ${id}: ${reason}`);
      }

      processed += 1;
      if (processed % 50 === 0) {
        await saveState(options, state);
        console.log(`  обработано ${processed}/${queue.length}`);
      }

      await sleep(options.delayMs);
    }
  };

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, () => worker()));
  await saveState(options, state);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  const averageBytes = stats.ok > 0 ? Math.round(stats.bytes / stats.ok) : 0;
  const report = {
    lang: options.lang,
    finishedAt: new Date().toISOString(),
    elapsedSec,
    requested: queue.length,
    ok: stats.ok,
    failed: stats.failed,
    noChords: stats.noChords,
    chordsShare: stats.ok > 0 ? Number((1 - stats.noChords / stats.ok).toFixed(3)) : 0,
    avgTextBytes: averageBytes,
    warnings: Object.fromEntries(warningCounts),
  };

  const suffix = options.limit ? `-${options.limit}` : '';
  const reportFile = resolve('data/build', `crawl-report-${options.lang}${suffix}.json`);
  await mkdir(dirname(reportFile), { recursive: true });
  await writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');

  console.log('\nИтог:');
  console.log(`  успешно: ${stats.ok}, ошибок: ${stats.failed}, без аккордов: ${stats.noChords}`);
  console.log(`  средний размер текста: ${averageBytes} байт, время: ${elapsedSec} c`);
  console.log(`  предупреждения: ${JSON.stringify(report.warnings)}`);
  console.log(`  отчёт: ${reportFile}`);
}

main().catch((error) => {
  console.error('Краулер остановлен:', error);
  process.exitCode = 1;
});

