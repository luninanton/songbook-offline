/**
 * Работа с аккордами: распознавание аккордовых строк и разбор обозначений.
 * Модуль общий для приложения и для краулера — импортируется и в WebView,
 * и в Node, поэтому никаких зависимостей от DOM.
 */

/** Немецкая нотация сайта: H = си, B = си-бемоль (по умолчанию) */
export type Notation = 'german' | 'international';

export const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const NOTE_TO_PC: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
  H: 11,
};

/** Регулярка аккорда: корень + модификаторы + необязательный бас после слэша */
const CHORD_RE = /^([A-H](?:#|b)?)((?:maj|min|m|M|dim|aug|sus|add|\+|-|\d|°|ø|\(|\)|\/)*)(?:\/([A-H](?:#|b)?))?$/;

/** Служебные пометки, которые в базе стоят в аккордовых строках */
const SECTION_WORDS = new Set([
  'intro',
  'verse',
  'chorus',
  'bridge',
  'instrumental',
  'outro',
  'pre',
  'prechorus',
  'tag',
  'refrain',
  'solo',
  'куплет',
  'припев',
  'бридж',
  'вступление',
  'проигрыш',
  'конец',
  'интро',
  'кода',
  'модуляция',
]);

export interface ParsedChord {
  /** Исходная запись как в тексте */
  raw: string;
  /** Корень в нормализованном виде (H → B, B → Bb) */
  root: string;
  /** Модификаторы (m, maj7, sus4 ...) в исходном виде */
  suffix: string;
  /** Бас после слэша, нормализованный */
  bass: string | null;
}

/** Приводит ноту к международной нотации */
export function normalizeNote(note: string, notation: Notation = 'german'): string {
  const letter = note[0] ?? '';
  const rest = note.slice(1);
  if (letter === 'H') return `B${rest}`;
  if (notation === 'german' && letter === 'B' && rest === '') return 'Bb';
  return note;
}

/**
 * Определяет нотацию по тексту песни: если встречается H (си) — немецкая система,
 * значит одиночная B = си-бемоль. Если H нет — считаем международной (B = си).
 * Примеры в базе есть для обоих случаев, поэтому определяем на каждую песню.
 */
export function detectNotation(text: string): Notation {
  return /(^|[\s|(])H(?:m|maj|min|sus|dim|aug|add|\d)*(?=$|[\s|)/.,;:])/m.test(text) ? 'german' : 'international';
}

/** Полутон для ноты (0 = C). Возвращает null, если это не нота. */
export function noteToSemitone(note: string, notation: Notation = 'german'): number | null {
  const normalized = normalizeNote(note, notation);
  const pc = NOTE_TO_PC[normalized];
  return pc === undefined ? null : pc;
}

/** Разбирает один токен как аккорд. Возвращает null, если токен аккордом не является. */
export function parseChordToken(token: string, notation: Notation = 'german'): ParsedChord | null {
  const cleaned = token.replace(/^[|(]+|[|)]+$/g, '').replace(/[.,;:]$/g, '');
  if (!cleaned) return null;

  const match = CHORD_RE.exec(cleaned);
  if (!match) return null;

  const root = normalizeNote(match[1] as string, notation);
  if (noteToSemitone(root, notation) === null) return null;

  const bassRaw = match[3];
  return {
    raw: token,
    root,
    suffix: match[2] ?? '',
    bass: bassRaw ? normalizeNote(bassRaw, notation) : null,
  };
}

/**
 * Является ли строка аккордовой.
 * В базе сайта аккорды стоят отдельными строками над словами, поэтому
 * критерий консервативный: все содержательные токены — аккорды или пометки частей.
 */
export function isChordLine(line: string, notation: Notation = 'german'): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Строка из одних разделителей (|, /, -) — типичная «линейка» боя/вступления
  if (/^[|\-–—/=\s]+$/.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return false;

  let chords = 0;
  let words = 0;

  for (const rawToken of tokens) {
    const token = rawToken.replace(/^\d+[.):]\s*/, '');
    if (!token) continue;
    if (/^[|/\\\-–—]+$/.test(token)) continue;

    const lower = token.toLowerCase().replace(/[^a-zа-яё]/g, '');
    if (SECTION_WORDS.has(lower)) continue;

    if (parseChordToken(token, notation)) {
      chords += 1;
    } else if (/^[A-Ha-h](?:#|b)?$/i.test(token) && !/[а-яё]/i.test(token)) {
      // отдельно стоящая латинская буква вроде "A" в аккордовой строке
      chords += 1;
    } else {
      words += 1;
    }
  }

  return chords > 0 && words === 0;
}

/** Все аккорды в строке (в порядке появления) */
export function extractChords(line: string, notation: Notation = 'german'): ParsedChord[] {
  const result: ParsedChord[] = [];
  for (const token of line.split(/\s+/)) {
    const chord = parseChordToken(token, notation);
    if (chord) result.push(chord);
  }
  return result;
}

/** Аккордовые строки текста */
export function chordLines(text: string, notation: Notation = 'german'): string[] {
  return text.split('\n').filter((line) => isChordLine(line, notation));
}

/** Есть ли в тексте хотя бы один аккорд (нотация определяется по самому тексту) */
export function hasChords(text: string): boolean {
  const notation = detectNotation(text);
  return text.split('\n').some((line) => isChordLine(line, notation));
}
