/**
 * Обновление базы (этап M6).
 *
 * Схема: на машине собирается манифест версии и дельта-пакет (только изменённые песни),
 * публикуется в GitHub Releases. Приложение по кнопке «Проверить обновления» читает
 * манифест, сравнивает версии и применяет дельту к локальной SQLite.
 *
 * Модуль чистый (без DOM и Capacitor) — покрыт тестами.
 */
import type { Song } from './types';

export interface UpdateAssets {
  name: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface UpdateManifest {
  schemaVersion: number;
  dataVersion: string;
  lang: string;
  count: number;
  withChords: number;
  builtAt: string;
  /** Полная база (если нужно переустановить с нуля) */
  full?: UpdateAssets;
  /** Дельта от предыдущей версии */
  delta?: UpdateAssets & { fromVersion: string };
}

export interface DeltaPack {
  fromVersion: string;
  toVersion: string;
  /** Изменённые и новые песни */
  songs: Song[];
  /** id удалённых с сайта песен */
  removed: number[];
}

export class UpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateError';
  }
}

export function parseManifest(json: unknown): UpdateManifest {
  if (!json || typeof json !== 'object') throw new UpdateError('Манифест обновления пуст');

  const value = json as Record<string, unknown>;
  const dataVersion = value.dataVersion;
  const count = value.count;

  if (typeof dataVersion !== 'string' || dataVersion.length === 0) {
    throw new UpdateError('В манифесте нет версии данных');
  }
  if (typeof count !== 'number' || count <= 0) {
    throw new UpdateError('В манифесте нет количества песен');
  }

  return {
    schemaVersion: Number(value.schemaVersion ?? 1),
    dataVersion,
    lang: String(value.lang ?? 'ru'),
    count,
    withChords: Number(value.withChords ?? 0),
    builtAt: String(value.builtAt ?? ''),
    full: parseAssets(value.full),
    delta: parseDelta(value.delta),
  };
}

function parseAssets(value: unknown): UpdateAssets | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const asset = value as Record<string, unknown>;
  if (typeof asset.name !== 'string' || typeof asset.url !== 'string') return undefined;
  return {
    name: asset.name,
    url: asset.url,
    bytes: Number(asset.bytes ?? 0),
    sha256: String(asset.sha256 ?? ''),
  };
}

function parseDelta(value: unknown): (UpdateAssets & { fromVersion: string }) | undefined {
  const assets = parseAssets(value);
  if (!assets) return undefined;
  const fromVersion = (value as Record<string, unknown>).fromVersion;
  if (typeof fromVersion !== 'string') return undefined;
  return { ...assets, fromVersion };
}

export function parseDeltaPack(json: unknown): DeltaPack {
  if (!json || typeof json !== 'object') throw new UpdateError('Дельта-пакет пуст');
  const value = json as Record<string, unknown>;
  if (!Array.isArray(value.songs)) throw new UpdateError('В дельта-пакете нет списка песен');

  return {
    fromVersion: String(value.fromVersion ?? ''),
    toVersion: String(value.toVersion ?? ''),
    songs: value.songs as Song[],
    removed: Array.isArray(value.removed) ? (value.removed as number[]) : [],
  };
}

export type UpdatePlanKind = 'up-to-date' | 'delta' | 'full' | 'unavailable';

export interface UpdatePlan {
  kind: UpdatePlanKind;
  /** Человекочитаемое объяснение для интерфейса */
  message: string;
  asset?: UpdateAssets;
  remoteVersion?: string;
}

/**
 * Решает, что делать: ничего, применить дельту или качать полную базу.
 * Дельта применима только от той версии, для которой её собрали.
 */
export function planUpdate(localVersion: string, manifest: UpdateManifest): UpdatePlan {
  if (manifest.dataVersion === localVersion) {
    return {
      kind: 'up-to-date',
      message: 'База уже актуальна',
      remoteVersion: manifest.dataVersion,
    };
  }

  if (manifest.delta && manifest.delta.fromVersion === localVersion) {
    return {
      kind: 'delta',
      message: `Доступно обновление ${manifest.dataVersion} (${formatBytes(manifest.delta.bytes)})`,
      asset: manifest.delta,
      remoteVersion: manifest.dataVersion,
    };
  }

  if (manifest.full) {
    return {
      kind: 'full',
      message: `Нужна полная база ${manifest.dataVersion} (${formatBytes(manifest.full.bytes)})`,
      asset: manifest.full,
      remoteVersion: manifest.dataVersion,
    };
  }

  return {
    kind: 'unavailable',
    message: 'Обновление есть, но файл для вашей версии не опубликован',
    remoteVersion: manifest.dataVersion,
  };
}

export interface DeltaStats {
  added: number;
  changed: number;
  removed: number;
}

export function deltaStats(pack: DeltaPack): DeltaStats {
  const added = pack.songs.filter((song) => !pack.removed.includes(song.id)).length;
  return { added, changed: 0, removed: pack.removed.length };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 КБ';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  const megabytes = (bytes / 1024 / 1024).toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${megabytes} МБ`;
}
