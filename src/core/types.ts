/** Модель данных: одна песня в локальной базе. */
export interface Song {
  /** id на сайте (он же URL: https://holychords.pro/<id>) */
  id: number;
  title: string;
  artist: string;
  artistId: number | null;
  album: string | null;
  albumId: number | null;
  /** Исходная тональность в нотации сайта: может быть 'H' (= си) и 'Bb' */
  key: string;
  /** Текст песни с аккордами — как отдаёт сайт, с сохранением пробелов и переводов строк */
  text: string;
  /** Источник: site — загружена с сайта, user — добавлена вручную */
  origin?: 'site' | 'user';
  /** Есть ли в песне аккорды (у части песен только слова) */
  hasChords: boolean;
  /** Язык песни в нашей кодировке: ru / uk / en / other */
  lang: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  /** Хэш (key + text) — для дельта-обновлений */
  hash: string;
}

export interface ParseResult {
  song: Song;
  /** Некритичные проблемы разметки, попадают в QA-отчёт */
  warnings: string[];
}

export type LangCode = 'ru' | 'uk' | 'en' | 'other';

/** Соответствие кодов языка сайта (страницы /lang/N) нашей кодировке */
export const SITE_LANG_IDS: Record<string, LangCode> = {
  '2': 'ru',
  '3': 'uk',
  '4': 'en',
};
