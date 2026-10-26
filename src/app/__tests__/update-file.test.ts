import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { describeDelta, gunzipToText, readDeltaFile } from '../update-file';

/** Собираем «файл обновления» в памяти: так же, как его делает scripts/build-delta.ts */
function makeFile(payload: unknown, name = 'delta.json.gz'): File {
  const gz = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  return new File([gz], name, { type: 'application/gzip' });
}

describe('update-file: импорт обновления из файла', () => {
  it('распаковывает gzip в текст', async () => {
    const gz = gzipSync(Buffer.from('проверка распаковки', 'utf8'));
    const buffer = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer;
    expect(await gunzipToText(buffer)).toBe('проверка распаковки');
  });

  it('читает корректный пакет', async () => {
    const file = makeFile({
      fromVersion: '2026-10-26',
      toVersion: '2026-11-01',
      songs: [{ id: 1, title: 'Тест' }],
      removed: [2],
    });
    const pack = await readDeltaFile(file);
    expect(pack.toVersion).toBe('2026-11-01');
    expect(pack.songs).toHaveLength(1);
    expect(pack.removed).toEqual([2]);
    expect(describeDelta(pack)).toContain('изменённых песен: 1');
  });

  it('отклоняет пустой файл', async () => {
    const file = new File([new Uint8Array()], 'empty.gz');
    await expect(readDeltaFile(file)).rejects.toThrow(/пустой/);
  });

  it('отклоняет файл, который не gzip', async () => {
    const file = new File([new TextEncoder().encode('просто текст')], 'bad.json.gz');
    await expect(readDeltaFile(file)).rejects.toThrow(/распаковать/);
  });

  it('отклоняет пакет без песен', async () => {
    const file = makeFile({ fromVersion: 'a', toVersion: 'b', songs: [], removed: [] });
    await expect(readDeltaFile(file)).rejects.toThrow(/нет изменений/);
  });
});
