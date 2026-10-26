import type { LangCode } from './types';

export interface CrawlState {
  version: 1;
  lang: LangCode;
  /** id песен, которые уже обработаны */
  done: number[];
  /** id, которые не удалось разобрать (с причиной) */
  failed: Record<string, string>;
  updatedAt: string;
}
