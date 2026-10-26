/**
 * Работа с аккордами: распознавание аккордовых строк и разбор обозначений.
 * Модуль общий для приложения и для краулера — импортируется и в WebView,
 * и в Node, поэтому никаких зависимостей от DOM.
 */

/** Немецкая нотация сайта: H = си, B = си-бемоль (по умолчанию) */
export type Notation = 'german' | 'international';

export const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Базовые ступени без альтераций */
const LETTER_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
  H: 11,
};

/** Регулярка аккорда: корень (включая двойные альтерации) + модификаторы + бас после слэша */
const CHORD_RE = /^([A-H](?:##|bb|#|b)?)((?:maj|min|m|M|dim|aug|sus|add|no|\+|-|\d|#|b|°|ø|\(|\))*)(?:\/([A-H](?:##|bb|#|b)?))?$/;

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
  /** Модификаторы (m, maj7, sus4, m7b5 ...) в исходном виде */
  suffix: string;
  /** Бас после слэша, нормализованный */
  bass: string | null;
  /** Полутон корня (0 = C). Считается сразу, чтобы не нормализовать дважды */
  rootSemitone: number;
  bassSemitone: number | null;
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

/**
 * Полутон для ноты (0 = C). Поддерживаются двойные альтерации (##, bb).
 * Возвращает null, если это не нота.
 */
export function noteToSemitone(note: string, notation: Notation = 'german'): number | null {
  const normalized = normalizeNote(note, notation);
  const match = /^([A-H])([#b]*)$/.exec(normalized);
  if (!match) return null;

  const base = LETTER_PC[match[1] as string];
  if (base === undefined) return null;

  let shift = 0;
  for (const symbol of match[2] as string) {
    shift += symbol === '#' ? 1 : -1;
  }

  return (((base + shift) % 12) + 12) % 12;
}

/** Разбирает один токен как аккорд. Возвращает null, если токен аккордом не является. */
export function parseChordToken(token: string, notation: Notation = 'german'): ParsedChord | null {
  const cleaned = token.replace(/^[|(]+|[|)]+$/g, '').replace(/[.,;:]$/g, '');
  if (!cleaned) return null;

  const match = CHORD_RE.exec(cleaned);
  if (!match) return null;

  const rootRaw = match[1] as string;
  const root = normalizeNote(rootRaw, notation);
  // noteToSemitone сам нормализует ноту, поэтому передаём исходную запись
  const rootSemitone = noteToSemitone(rootRaw, notation);
  if (rootSemitone === null) return null;

  const bassRaw = match[3];
  const bass = bassRaw ? normalizeNote(bassRaw, notation) : null;
  const bassSemitone = bassRaw ? noteToSemitone(bassRaw, notation) : null;

  return {
    raw: token,
    root,
    suffix: match[2] ?? '',
    bass,
    rootSemitone,
    bassSemitone,
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
