import {
  CHROMATIC_FLAT,
  CHROMATIC_SHARP,
  detectNotation,
  isChordLine,
  noteToSemitone,
  parseChordToken,
  type Notation,
} from './chords';

/**
 * Транспонирование аккордов.
 *
 * Правила:
 *  - меняются только аккордовые строки, текст песен не трогаем;
 *  - сохраняется нотация песни: если в песне немецкая система (H = си),
 *    то после сдвига си снова записывается как H, а си-бемоль — как B;
 *  - знак (диез/бемоль) выбирается по исходному знаку аккорда, иначе по тональности;
 *  - выравнивание сохраняется: каждый аккорд остаётся на своей колонке,
 *    «лишние» символы добираются/убираются из пробелов перед аккордом.
 */

/** Названия ступеней: 0 = C … 11 */
const SHARP_NAMES = CHROMATIC_SHARP;
const FLAT_NAMES = CHROMATIC_FLAT;

/** Немецкая система: B = си-бемоль, H = си */
const GERMAN_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'] as const;
const GERMAN_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'B', 'H'] as const;

/** Тональности, в которых принято писать бемоли (кварто-квинтовый круг) */
const FLAT_SEMITONES = new Set([1, 3, 5, 8, 10]);

export interface TransposeOptions {
  /** Нотация результата; по умолчанию определяется по тексту песни */
  notation?: Notation;
  /** Предпочитать бемоли (обычно берётся из целевой тональности) */
  preferFlats?: boolean;
}

function noteName(semitone: number, notation: Notation, preferFlats: boolean): string {
  const index = ((semitone % 12) + 12) % 12;
  if (notation === 'german') {
    return preferFlats ? (GERMAN_FLAT[index] as string) : (GERMAN_SHARP[index] as string);
  }
  return preferFlats ? (FLAT_NAMES[index] as string) : (SHARP_NAMES[index] as string);
}

/** Транспонирует одну ноту (без модификаторов) */
export function transposeNote(note: string, semitones: number, options: TransposeOptions = {}): string {
  const notation = options.notation ?? 'international';
  const semitone = noteToSemitone(note, notation);
  if (semitone === null) return note;

  const preferFlats = options.preferFlats ?? note.includes('b');
  return noteName(semitone + semitones, notation, preferFlats);
}

/** Транспонирует один аккорд, сохраняя модификаторы, бас и обрамление (|, скобки) */
export function transposeChord(
  token: string,
  semitones: number,
  options: TransposeOptions = {},
): string {
  const notation = options.notation ?? 'international';
  const prefix = /^[|(]+/.exec(token)?.[0] ?? '';
  const suffix = /[|)]+$|[.,;:]+$/.exec(token)?.[0] ?? '';
  const core = token.slice(prefix.length, token.length - suffix.length);

  // Полутоны берём из разбора: повторная нормализация уже нормализованного корня сломала бы H/B
  const parsed = parseChordToken(core, notation);
  if (!parsed) return token;

  const preferFlats = options.preferFlats ?? core.includes('b');
  let result = noteName(parsed.rootSemitone + semitones, notation, preferFlats) + parsed.suffix;

  if (parsed.bassSemitone !== null) {
    result += `/${noteName(parsed.bassSemitone + semitones, notation, preferFlats)}`;
  }

  return `${prefix}${result}${suffix}`;
}


/** Предпочитать ли бемоли для тональности (с учётом сдвига) */
export function keyPreferFlats(key: string, semitones = 0, notation: Notation = 'international'): boolean {
  if (key.includes('b')) return true;
  if (key.includes('#')) return false;
  const base = noteToSemitone(key, notation);
  if (base === null) return false;
  return FLAT_SEMITONES.has((((base + semitones) % 12) + 12) % 12);
}

/** Транспонирует тональность песни и возвращает её название */
export function transposeKey(key: string, semitones: number, options: TransposeOptions = {}): string {
  const notation = options.notation ?? 'international';
  const base = noteToSemitone(key, notation);
  if (base === null) return key;
  const preferFlats = options.preferFlats ?? keyPreferFlats(key, semitones, notation);
  return noteName(base + semitones, notation, preferFlats);
}

/**
 * Транспонирует аккордовую строку, сохраняя колонки.
 * Каждый аккорд остаётся на своей позиции: если новый аккорд короче — добавляются пробелы,
 * если длиннее — «съедаются» пробелы слева (минимум один остаётся).
 */
export function transposeChordLine(
  line: string,
  semitones: number,
  options: TransposeOptions = {},
): string {
  const notation = options.notation ?? 'international';
  const tokenRe = /\S+/g;
  let result = '';
  let previousEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(line)) !== null) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    const gap = line.slice(previousEnd, start);
    const transposed = transposeChord(token, semitones, { ...options, notation });

    if (transposed === token) {
      result += gap + token;
      previousEnd = end;
      continue;
    }

    const delta = transposed.length - token.length;
    let gapOut = gap;

    if (delta > 0) {
      const trailingSpaces = / *$/.exec(gap)?.[0].length ?? 0;
      const canShrink = Math.max(0, trailingSpaces - 1);
      const shrinkBy = Math.min(delta, canShrink);
      gapOut = gap.slice(0, gap.length - shrinkBy);
    }

    result += gapOut + transposed;
    if (delta < 0) result += ' '.repeat(-delta);
    previousEnd = end;
  }

  return result + line.slice(previousEnd);
}

/** Транспонирует весь текст песни: меняются только аккордовые строки */
export function transposeText(text: string, semitones: number, options: TransposeOptions = {}): string {
  const shift = ((semitones % 12) + 12) % 12;
  if (shift === 0) return text;

  const notation = options.notation ?? detectNotation(text);
  return text
    .split('\n')
    .map((line) =>
      isChordLine(line, notation) ? transposeChordLine(line, semitones, { ...options, notation }) : line,
    )
    .join('\n');
}

export interface SongView {
  text: string;
  key: string;
}

export interface RenderOptions {
  /** Целевая тональность (название); если не задана — берётся исходная */
  targetKey?: string;
  /** Сдвиг в полутонах (приоритетнее targetKey) */
  semitones?: number;
  /** Капо: аккорды показываются ниже на capo полутонов, звучит целевая тональность */
  capo?: number;
}

export interface RenderedSong {
  /** Текст с аккордами для отображения */
  text: string;
  /** Тональность песни (звучит) */
  key: string;
  /** Тональность аккордов в позиции капо */
  shapeKey: string;
  capo: number;
  /** Итоговый сдвиг аккордов относительно исходного текста */
  semitones: number;
  notation: Notation;
}

/** Единая точка входа для экрана песни: тональность + капо → готовый текст */
export function renderSong(song: SongView, options: RenderOptions = {}): RenderedSong {
  const notation = detectNotation(song.text);
  const baseSemitone = noteToSemitone(song.key, notation);
  const capo = options.capo ?? 0;

  let semitones = (((options.semitones ?? 0) % 12) + 12) % 12;
  let targetKey = song.key;

  if (options.targetKey) {
    const targetSemitone = noteToSemitone(options.targetKey, notation);
    if (baseSemitone !== null && targetSemitone !== null) {
      semitones = ((((targetSemitone - baseSemitone) % 12) + 12) % 12);
      targetKey = options.targetKey;
    }
  } else if (baseSemitone !== null && semitones !== 0) {
    targetKey = transposeKey(song.key, semitones, { notation });
  }

  const preferFlats =
    baseSemitone !== null
      ? FLAT_SEMITONES.has(((((baseSemitone + semitones - capo) % 12) + 12) % 12))
      : keyPreferFlats(targetKey, 0, notation);
  const shiftForChords = semitones - capo;

  return {
    text: transposeText(song.text, shiftForChords, { notation, preferFlats }),
    key: targetKey,
    shapeKey: transposeKey(song.key, shiftForChords, { notation, preferFlats }),
    capo,
    semitones: shiftForChords,
    notation,
  };
}
