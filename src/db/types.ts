/** Модели для UI и слоя данных. */
export interface SongRow {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  key: string;
  hasChords: boolean;
}

export interface SongFull extends SongRow {
  text: string;
}

export interface SongQuery {
  query?: string;
  sort?: 'new' | 'popular' | 'title';
  limit?: number;
  offset?: number;
  favoritesOnly?: boolean;
  /** Список id избранного — нужен, когда фильтр по избранному включён */
  favorites?: number[];
}

export interface SongPage {
  items: SongRow[];
  total: number;
}

export interface DbMeta {
  count: number;
  withChords: number;
  dataVersion: string;
  builtAt: string;
}

/** Слой данных: одинаковый интерфейс для демо-режима и нативного SQLite */
export interface SongRepository {
  ready(): Promise<void>;
  meta(): Promise<DbMeta>;
  search(params: SongQuery): Promise<SongPage>;
  get(id: number): Promise<SongFull | null>;
  /** Максимальный id в базе — по нему определяем новые песни на сайте */
  maxId(): Promise<number>;
}
