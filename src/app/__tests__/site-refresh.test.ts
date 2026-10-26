import { describe, expect, it } from 'vitest';
import { findRemoved, isSongChanged } from '../site-refresh';
import type { Song } from '../../core/types';

function song(id: number, hash: string): Song {
  return {
    id,
    title: 'Тест',
    artist: 'Тест',
    artistId: null,
    album: null,
    albumId: null,
    key: 'C',
    text: 'C\nстрока',
    hasChords: true,
    lang: 'ru',
    publishedAt: null,
    modifiedAt: null,
    hash,
  };
}

describe('site-refresh: сравнение с локальной базой', () => {
  it('новая песня (нет локального хэша) не считается изменённой', () => {
    expect(isSongChanged(song(1, 'aaa'), undefined)).toBe(false);
  });

  it('совпадение хэшей — без изменений', () => {
    expect(isSongChanged(song(1, 'aaa'), 'aaa')).toBe(false);
  });

  it('разные хэши — песня изменилась', () => {
    expect(isSongChanged(song(1, 'bbb'), 'aaa')).toBe(true);
  });

  it('находит песни, пропавшие с сайта', () => {
    const local = [1, 2, 3, 4];
    const remote = new Set([1, 2, 4]);
    expect(findRemoved(local, remote)).toEqual([3]);
  });

  it('не считает удалёнными песни, которых не было в локальной базе', () => {
    const local = [1, 2];
    const remote = new Set([1, 2, 3]);
    expect(findRemoved(local, remote)).toEqual([]);
  });
});
