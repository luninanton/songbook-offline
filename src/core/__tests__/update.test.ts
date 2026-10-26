import { describe, expect, it } from 'vitest';
import { formatBytes, parseDeltaPack, parseManifest, planUpdate } from '../update';

const MANIFEST = {
  schemaVersion: 1,
  dataVersion: '2026-11-01',
  lang: 'ru',
  count: 43200,
  withChords: 29000,
  builtAt: '2026-11-01T10:00:00.000Z',
  full: { name: 'songs.db.gz', url: 'https://example.com/songs.db.gz', bytes: 45_000_000, sha256: 'abc' },
  delta: {
    name: 'delta-2026-11-01.json.gz',
    url: 'https://example.com/delta-2026-11-01.json.gz',
    bytes: 1_500_000,
    sha256: 'def',
    fromVersion: '2026-10-26',
  },
};

describe('update: манифест', () => {
  it('разбирает корректный манифест', () => {
    const manifest = parseManifest(MANIFEST);
    expect(manifest.dataVersion).toBe('2026-11-01');
    expect(manifest.count).toBe(43200);
    expect(manifest.delta?.fromVersion).toBe('2026-10-26');
    expect(manifest.full?.bytes).toBe(45_000_000);
  });

  it('отклоняет манифест без версии и количества', () => {
    expect(() => parseManifest({ count: 10 })).toThrowError(/версии/);
    expect(() => parseManifest({ dataVersion: '2026-11-01' })).toThrowError(/количества/);
    expect(() => parseManifest(null)).toThrowError(/пуст/);
  });

  it('разбирает дельта-пакет и считает удалённые', () => {
    const pack = parseDeltaPack({
      fromVersion: '2026-10-26',
      toVersion: '2026-11-01',
      songs: [{ id: 1 }, { id: 2 }],
      removed: [3],
    });
    expect(pack.songs).toHaveLength(2);
    expect(pack.removed).toEqual([3]);
    expect(() => parseDeltaPack({})).toThrowError(/списка песен/);
  });
});

describe('update: план обновления', () => {
  it('ничего не делает, если версии совпадают', () => {
    const plan = planUpdate('2026-11-01', parseManifest(MANIFEST));
    expect(plan.kind).toBe('up-to-date');
  });

  it('предлагает дельту, если она собрана от локальной версии', () => {
    const plan = planUpdate('2026-10-26', parseManifest(MANIFEST));
    expect(plan.kind).toBe('delta');
    expect(plan.asset?.name).toBe('delta-2026-11-01.json.gz');
    expect(plan.message).toContain('1,4 МБ');
  });

  it('предлагает полную базу, если дельта от другой версии', () => {
    const plan = planUpdate('2026-09-01', parseManifest(MANIFEST));
    expect(plan.kind).toBe('full');
    expect(plan.asset?.name).toBe('songs.db.gz');
  });

  it('сообщает, если подходящего файла нет', () => {
    const manifest = parseManifest({ ...MANIFEST, full: undefined, delta: undefined });
    const plan = planUpdate('2026-09-01', manifest);
    expect(plan.kind).toBe('unavailable');
  });

  it('форматирует размеры', () => {
    expect(formatBytes(0)).toBe('0 КБ');
    expect(formatBytes(900)).toBe('900 Б');
    expect(formatBytes(2048)).toBe('2 КБ');
    expect(formatBytes(5_242_880)).toBe('5,0 МБ');
  });
});
