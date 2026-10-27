import { parseChordToken, type Notation } from './chords';

/**
 * Аппликатуры аккордов для гитары.
 *
 * Схемы не хранятся картинками, а рассчитываются: есть открытые позиции для
 * популярных аккордов и подвижные формы (баррэ) от 6-й и 5-й струны, из которых
 * получается любой аккорд в любой тональности. Это позволяет показывать диаграмму
 * офлайн и после транспонирования.
 */
export interface ChordShape {
  /** Лады от 6-й струны к 1-й: -1 — струна не играется, 0 — открытая */
  frets: number[];
  /** Лад, с которого начинается показ (1 — у порожка) */
  baseFret: number;
}

type Quality = 'maj' | 'min' | '7' | 'm7' | 'maj7' | 'sus2' | 'sus4' | '6' | 'm6';

const OPEN_SHAPES: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  C7: [-1, 3, 2, 3, 1, 0],
  D: [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  D7: [-1, -1, 0, 2, 1, 2],
  E: [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  E7: [0, 2, 0, 1, 0, 0],
  Em7: [0, 2, 0, 0, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  Fmaj7: [-1, -1, 3, 2, 1, 0],
  G: [3, 2, 0, 0, 0, 3],
  G7: [3, 2, 0, 0, 0, 1],
  A: [-1, 0, 2, 2, 2, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  A7: [-1, 0, 2, 0, 2, 0],
  Am7: [-1, 0, 2, 0, 1, 0],
  Amaj7: [-1, 0, 2, 1, 2, 0],
  B7: [-1, 2, 1, 2, 0, 2],
  Bm: [-1, 2, 4, 4, 3, 2],
  Bb: [-1, 1, 3, 3, 3, 1],
  B: [-1, 2, 4, 4, 4, 2],
};

/** Подвижные формы: смещения от лада баррэ, 0 — сам лад баррэ */
const MOVABLE: Record<Quality, { e: number[]; a: number[] }> = {
  maj: { e: [0, 2, 2, 1, 0, 0], a: [-1, 0, 2, 2, 2, 0] },
  min: { e: [0, 2, 2, 0, 0, 0], a: [-1, 0, 2, 2, 1, 0] },
  '7': { e: [0, 2, 0, 1, 0, 0], a: [-1, 0, 2, 0, 2, 0] },
  m7: { e: [0, 2, 0, 0, 0, 0], a: [-1, 0, 2, 0, 1, 0] },
  maj7: { e: [0, 2, 1, 1, 0, 0], a: [-1, 0, 2, 1, 2, 0] },
  sus2: { e: [0, 2, 4, 4, 0, 0], a: [-1, 0, 2, 2, 0, 0] },
  sus4: { e: [0, 2, 2, 2, 0, 0], a: [-1, 0, 2, 2, 3, 0] },
  '6': { e: [0, 2, 2, 1, 2, 0], a: [-1, 0, 2, 2, 2, 2] },
  m6: { e: [0, 2, 2, 0, 2, 0], a: [-1, 0, 2, 2, 1, 2] },
};

/** Состав аккорда в полутонах от основы — для подсказки, если схемы нет */
const INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  m7b5: [0, 3, 6, 10],
  add9: [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14],
  '5': [0, 7],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function toQuality(suffix: string): Quality | null {
  switch (suffix) {
    case '':
      return 'maj';
    case 'm':
    case 'min':
      return 'min';
    case '7':
      return '7';
    case 'm7':
    case 'min7':
      return 'm7';
    case 'maj7':
    case 'M7':
      return 'maj7';
    case 'sus2':
      return 'sus2';
    case 'sus4':
    case 'sus':
      return 'sus4';
    case '6':
      return '6';
    case 'm6':
      return 'm6';
    default:
      return null;
  }
}

/**
 * Аппликатура для аккорда. Возвращает null, если для такой разновидности
 * (add9, dim, aug, m7b5 …) схемы нет — тогда показываем состав из нот.
 */
export function getChordShape(name: string, notation: Notation = 'international'): ChordShape | null {
  const parsed = parseChordToken(name, notation);
  if (!parsed) return null;

  const quality = toQuality(parsed.suffix);
  if (!quality) return null;

  const open = OPEN_SHAPES[parsed.root + parsed.suffix];
  if (open) {
    return { frets: [...open], baseFret: 1 };
  }

  const semitone = parsed.rootSemitone;

  const shapes = MOVABLE[quality];

  // Форма от 6-й струны: основа на E (ми = 4), от 5-й — на A (ля = 9)
  const eFret = ((semitone - 4 + 12) % 12) || 12;
  const aFret = ((semitone - 9 + 12) % 12) || 12;

  const useE = eFret <= aFret;
  const baseFret = useE ? eFret : aFret;
  const template = useE ? shapes.e : shapes.a;

  const frets = template.map((offset) => {
    if (offset === -1) return -1;
    return baseFret + offset;
  });

  return { frets, baseFret };
}

/** Ноты аккорда (для подсказки, когда схемы нет) */
export function chordNotes(name: string, notation: Notation = 'international'): string[] {
  const parsed = parseChordToken(name, notation);
  if (!parsed) return [];

  const intervals = INTERVALS[parsed.suffix] ?? [0, 4, 7];
  const root = parsed.rootSemitone;

  return intervals.map((interval) => NOTE_NAMES[(root + interval) % 12] as string);
}

/** Человеческое описание аппликатуры: «x32010» или «5fr: 577655» */
export function describeShape(shape: ChordShape): string {
  return shape.frets
    .map((fret) => (fret === -1 ? 'x' : fret === 0 ? '0' : String(fret)))
    .join('');
}
