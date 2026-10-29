import { parseChordToken, type Notation } from './chords';

/**
 * Клавиши пианино для аккорда.
 *
 * Считается из состава аккорда (формула интервалов), поэтому работает для любых
 * аккордов, включая те, для которых нет гитарной аппликатуры (dim, add9, m7b5).
 * Названия нот пишутся так же, как корень аккорда: Bb → Bb, F# → F#.
 */
export interface PianoKey {
  /** Название ноты в записи аккорда */
  note: string;
  /** Полутон от C (0…11) */
  semitone: number;
  /** Это бас слэш-аккорда (например, B в G/B) */
  isBass: boolean;
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Интервалы аккорда в полутонах от основы */
const INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '2': [0, 2, 7],
  '4': [0, 5, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  m7b5: [0, 3, 6, 10],
  add9: [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14],
  '5': [0, 7],
};

export function chordPianoKeys(name: string, notation: Notation = 'international'): PianoKey[] {
  const parsed = parseChordToken(name, notation);
  if (!parsed) return [];

  const intervals = INTERVALS[parsed.suffix] ?? INTERVALS[''];
  // уменьшённые аккорды принято записывать с бемолями: Cdim = C-Eb-Gb
  const useFlats =
    parsed.root.includes('b') || ['dim', 'dim7', 'm7b5'].includes(parsed.suffix);
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;

  const keys: PianoKey[] = intervals.map((interval) => {
    const semitone = (parsed.rootSemitone + interval) % 12;
    return { note: names[semitone] as string, semitone, isBass: false };
  });

  if (parsed.bassSemitone !== null) {
    const semitone = parsed.bassSemitone;
    keys.push({ note: names[semitone] as string, semitone, isBass: true });
  }

  return keys;
}
