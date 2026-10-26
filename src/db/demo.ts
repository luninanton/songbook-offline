import type { DbMeta, SongFull, SongPage, SongQuery, SongRepository, WriteResult } from './types';

/**
 * Демо-репозиторий для запуска в браузере (npm run dev) без собранной базы.
 * Тексты песен здесь вымышленные — это не реальные песни, а тестовые заглушки
 * для проверки вёрстки и транспонирования.
 */
const DEMO_SONGS: SongFull[] = [
  {
    id: 1,
    title: 'Тестовая песня первая',
    artist: 'Демо-исполнитель',
    album: 'Демо-сборник',
    key: 'G',
    hasChords: true,
    text: [
      'Куплет 1:',
      'G           D',
      'строка текста раз',
      '        Em          C',
      'строка текста два',
      '',
      'Припев:',
      'C        D        G',
      'строка припева раз',
      'C        D        Em',
      'строка припева два',
    ].join('\n'),
  },
  {
    id: 2,
    title: 'Тестовая песня вторая',
    artist: 'Демо-исполнитель',
    album: 'Демо-сборник',
    key: 'Hm',
    hasChords: true,
    text: [
      'Интро:',
      '| Hm /// | G /// | D /// | A /// |',
      '',
      'Куплет:',
      'Hm              G',
      'строка куплета раз',
      'D               A',
      'строка куплета два',
    ].join('\n'),
  },
  {
    id: 3,
    title: 'Песня с бемолями',
    artist: 'Второй исполнитель',
    album: null,
    key: 'Bb',
    hasChords: true,
    text: ['Bb        Eb', 'строка раз', '      F         Gm', 'строка два'].join('\n'),
  },
  {
    id: 4,
    title: 'Песня со слэш-аккордами',
    artist: 'Второй исполнитель',
    album: null,
    key: 'D',
    hasChords: true,
    text: ['D/F#      G/B', 'строка раз', 'A/C#      D', 'строка два'].join('\n'),
  },
  {
    id: 5,
    title: 'Песня только со словами',
    artist: 'Третий исполнитель',
    album: null,
    key: '',
    hasChords: false,
    text: ['строка раз', 'строка два', 'строка три'].join('\n'),
  },
];

function toRow(song: SongFull) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    key: song.key,
    hasChords: song.hasChords,
  };
}

export class DemoRepository implements SongRepository {
  async ready(): Promise<void> {
    return;
  }

  async meta(): Promise<DbMeta> {
    return {
      count: DEMO_SONGS.length,
      withChords: DEMO_SONGS.filter((song) => song.hasChords).length,
      dataVersion: 'demo',
      builtAt: new Date().toISOString(),
    };
  }

  async search(params: SongQuery): Promise<SongPage> {
    let items = [...DEMO_SONGS];
    const query = (params.query ?? '').trim().toLowerCase();

    if (query) {
      items = items.filter(
        (song) =>
          song.title.toLowerCase().includes(query) ||
          song.artist.toLowerCase().includes(query) ||
          song.text.toLowerCase().includes(query),
      );
    }

    if (params.favoritesOnly) items = items.slice(0, 2);
    if (params.sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title, 'ru'));

    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;

    return { items: items.slice(offset, offset + limit).map(toRow), total: items.length };
  }

  async get(id: number): Promise<SongFull | null> {
    return DEMO_SONGS.find((song) => song.id === id) ?? null;
  }

  async maxId(): Promise<number> {
    return Math.max(...DEMO_SONGS.map((song) => song.id));
  }

  async allHashes(): Promise<Map<number, string>> {
    // В демо-режиме хэшей нет: полная проверка с сайта здесь не применяется
    return new Map();
  }

  async writeDelta(): Promise<WriteResult> {
    throw new Error('В демо-режиме обновление базы недоступно');
  }
}
