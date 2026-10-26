import { hasChords } from './chords';
import { hashText } from './hash';
import type { ParseResult, Song } from './types';

/**
 * Парсер страницы песни holychords.pro.
 *
 * Работает на «сыром» HTML без DOM-библиотек, чтобы один и тот же код
 * использовался и в краулере (Node), и в приложении при онлайн-обновлении.
 *
 * Проверенная структура страницы:
 *   <pre id="music_text" class="Db" itemprop="lyrics">…</pre>  — текст с аккордами,
 *   class = тональность; аккорды отдельными строками над словами.
 *   window.music  = { id, feat }   — id песни
 *   window.artist = { id }         — id исполнителя
 *   window.album  = { id }         — id альбома
 *   <meta itemprop="name" content="Исполнитель - Название">
 */

export class ParseError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_found' | 'no_lyrics_block' | 'deleted' | 'unexpected',
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  laquo: '«',
  raquo: '»',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] ?? match;
  });
}

/** Приводит содержимое <pre> к чистому тексту: снимает теги, декодирует сущности */
export function extractPreText(raw: string): string {
  const withBreaks = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(withBreaks).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
}

function findNumber(html: string, pattern: RegExp): number | null {
  const match = pattern.exec(html);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(value) ? value : null;
}

function metaContent(html: string, itemprop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*itemprop=["']${itemprop}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*itemprop=["']${itemprop}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return decodeEntities(match[1] as string).trim() || null;
  }
  return null;
}

/** Название песни и исполнитель: сначала schema.org-разметка, затем <title> */
function parseTitleAndArtist(html: string): { title: string; artist: string; warnings: string[] } {
  const warnings: string[] = [];
  const schemaName = metaContent(html, 'name');

  if (schemaName) {
    const separator = schemaName.indexOf(' - ');
    if (separator > 0) {
      return {
        artist: schemaName.slice(0, separator).trim(),
        title: schemaName.slice(separator + 3).trim(),
        warnings,
      };
    }
    warnings.push('name без разделителя « - »');
    return { artist: '', title: schemaName, warnings };
  }

  const titleTag = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const cleanTitle = decodeEntities(titleTag).split('|')[0]?.trim() ?? '';
  warnings.push('нет itemprop="name", взяли <title>');
  return { artist: '', title: cleanTitle, warnings };
}

export interface ParseOptions {
  /** id из URL — приоритетнее, чем window.music.id */
  id?: number;
  /** язык в нашей кодировке (ru/uk/en/other); краулер знает его из списка /lang/N */
  lang?: string;
}

export function parseSongPage(html: string, options: ParseOptions = {}): ParseResult {
  if (/id=["']content_none["']/.test(html) && !/id=["']music_text["']/.test(html)) {
    throw new ParseError('Песня неактивна или удалена', 'deleted');
  }

  const preMatch = /<pre[^>]*id=["']music_text["'][^>]*>([\s\S]*?)<\/pre>/i.exec(html);
  if (!preMatch) {
    throw new ParseError('Не найден блок pre#music_text', 'no_lyrics_block');
  }

  const openTag = /<pre[^>]*id=["']music_text["'][^>]*>/i.exec(html)?.[0] ?? '';
  const classAttr = /class=["']([^"']*)["']/i.exec(openTag)?.[1] ?? '';
  const key = classAttr.split(/\s+/).find((token) => /^[A-H][#b]?$/.test(token)) ?? '';

  const text = extractPreText(preMatch[1] as string);
  const warnings: string[] = [];
  if (!key) warnings.push('не определена тональность');
  if (!text.trim()) warnings.push('пустой текст песни');

  const parsedTitle = parseTitleAndArtist(html);
  warnings.push(...parsedTitle.warnings);

  const musicId = findNumber(html, /window\.music\s*=\s*\{[^}]*?id:\s*(\d+)/);
  const artistId = findNumber(html, /window\.artist\s*=\s*\{[^}]*?id:\s*(\d+)/);
  const albumId = findNumber(html, /window\.album\s*=\s*\{[^}]*?id:\s*(\d+)/);

  const id = options.id ?? musicId;
  if (!id) throw new ParseError('Не удалось определить id песни', 'unexpected');

  const albumBlock =
    /<div[^>]*id=["']music_viewer["'][\s\S]{0,4000}?<div[^>]*class=["'][^"']*media-body[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(
      html,
    );
  const album = albumBlock
    ? decodeEntities((albumBlock[1] as string).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    : '';
  if (!album) warnings.push('не найден альбом');

  const song: Song = {
    id,
    title: parsedTitle.title || 'Без названия',
    artist: parsedTitle.artist || 'Неизвестен',
    artistId,
    album: album || null,
    albumId,
    key,
    text,
    hasChords: hasChords(text),
    lang: options.lang ?? 'other',
    publishedAt: metaContent(html, 'datePublished'),
    modifiedAt: metaContent(html, 'dateModified'),
    hash: hashText(`${key}\n${text}`),
  };

  if (!song.hasChords) warnings.push('нет аккордов (только текст)');

  return { song, warnings };
}

