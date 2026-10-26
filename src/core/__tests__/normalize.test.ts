import { describe, expect, it } from 'vitest';
import { buildFtsQueries, normalizeForSearch, toFtsQuery } from '../normalize';

describe('normalize: поисковый запрос', () => {
  it('нормализует регистр, ё и лишние пробелы', () => {
    expect(normalizeForSearch('  Ёлка   В Лесу ')).toBe('елка в лесу');
  });

  it('делает префиксным последний токен', () => {
    expect(toFtsQuery('елка в лесу')).toBe('("елка" OR "ёлка") AND "в" AND ("лесу"* OR "лёсу"*)');
  });

  it('подставляет вариант с ё, чтобы находилось «всё» по запросу «все»', () => {
    expect(toFtsQuery('все')).toBe('("все"* OR "всё"*)');
    expect(toFtsQuery('пойдем домой')).toBe('("пойдем" OR "пойдём") AND "домой"*');
  });

  it('даёт мягкий вариант через OR для частичных совпадений', () => {
    const queries = buildFtsQueries('благодать любовь');
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain(' AND ');
    expect(queries[1]).toContain(' OR ');
  });

  it('убирает знаки препинания и пустые запросы', () => {
    expect(toFtsQuery('!!! ...')).toBe('');
    expect(buildFtsQueries('   ')).toEqual([]);
    expect(toFtsQuery('«привет», мир!')).toBe('("привет" OR "привёт") AND "мир"*');
  });
});
