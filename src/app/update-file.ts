import { parseDeltaPack, type DeltaPack } from '../core/update';

/**
 * Импорт обновления из локального файла (этап M6, вариант без хостинга).
 *
 * Сценарий: на компьютере собран delta-<версия>.json.gz (`npm run delta:build`),
 * файл перенесён на телефон, в приложении выбран через системный диалог.
 * Никакой публикации базы при этом не происходит.
 */

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Распаковывает gzip-буфер в строку через встроенный DecompressionStream */
export async function gunzipToText(buffer: ArrayBuffer): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ImportError('Устройство не поддерживает распаковку gzip');
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Читает выбранный файл и возвращает проверенный дельта-пакет */
export async function readDeltaFile(file: File): Promise<DeltaPack> {
  const buffer = await file.arrayBuffer();

  if (buffer.byteLength === 0) throw new ImportError('Файл пустой');

  let text: string;
  try {
    text = await gunzipToText(buffer);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Не удалось распаковать файл: ожидается .json.gz');
  }

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new ImportError('Внутри файла не JSON');
  }

  const pack = parseDeltaPack(json);
  if (pack.songs.length === 0 && pack.removed.length === 0) {
    throw new ImportError('В файле нет изменений');
  }

  return pack;
}

/** Описание пакета для интерфейса */
export function describeDelta(pack: DeltaPack): string {
  const parts = [`версия ${pack.toVersion || '—'}`];
  parts.push(`изменённых песен: ${pack.songs.length}`);
  if (pack.removed.length > 0) parts.push(`удалённых: ${pack.removed.length}`);
  if (pack.fromVersion) parts.push(`от ${pack.fromVersion}`);
  return parts.join(', ');
}
