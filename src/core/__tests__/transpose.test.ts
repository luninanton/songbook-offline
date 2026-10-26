import { describe, expect, it } from 'vitest';
import { noteToSemitone } from '../chords';
import { renderSong, transposeChord, transposeKey, transposeText } from '../transpose';

/**
 * Тексты в тестах — вымышленные (никаких реальных песен), проверяем только аккорды
 * и геометрию строк.
 */
const SONG = ['Db        Gb', 'строка раз два', '      Ab        Bbm', 'строка три четыре', ''].join('\n');

describe('transpose: сдвиг на октаву', () => {
  it('±12 возвращает текст байт-в-байт', () => {
    expect(transposeText(SONG, 12)).toBe(SONG);
    expect(transposeText(SONG, -12)).toBe(SONG);
    expect(transposeText(SONG, 0)).toBe(SONG);
  });

  it('текст песен не меняется — только аккордовые строки', () => {
    const shifted = transposeText(SONG, 2);
    expect(shifted.split('\n')[1]).toBe('строка раз два');
    expect(shifted.split('\n')[3]).toBe('строка три четыре');
    expect(shifted).not.toBe(SONG);
  });

  it('сохраняет количество строк и колонку начала аккордов', () => {
    const shifted = transposeText(SONG, 5);
    const before = SONG.split('\n');
    const after = shifted.split('\n');
    expect(after).toHaveLength(before.length);
    expect(after[0]?.length).toBeGreaterThanOrEqual((before[0] as string).length);
    expect(after[0]?.search(/\S/)).toBe((before[0] as string).search(/\S/));
    expect(after[1]).toBe(before[1]);
    expect(after[3]).toBe(before[3]);
  });
});

describe('transpose: высота аккордов', () => {
  it('поднимает и опускает на полутон', () => {
    expect(transposeChord('C', 1)).toBe('C#');
    expect(transposeChord('C', -1)).toBe('B');
    expect(transposeChord('Am7', 3)).toBe('Cm7');
    expect(transposeChord('Dsus4', 1, { preferFlats: true })).toBe('Ebsus4');
  });

  it('сохраняет модификаторы', () => {
    expect(transposeChord('Cmaj7', 2)).toBe('Dmaj7');
    expect(transposeChord('F#m7b5', 1)).toBe('Gm7b5');
    expect(transposeChord('Aadd9', 2)).toBe('Badd9');
  });

  it('транспонирует бас слэш-аккордов', () => {
    expect(transposeChord('G/B', 2, { notation: 'international' })).toBe('A/C#');
    expect(transposeChord('D/F#', -2)).toBe('C/E');
  });

  it('сохраняет обрамление токена', () => {
    expect(transposeChord('|Db', 2)).toBe('|Eb');
    expect(transposeChord('(Ab)', 2)).toBe('(Bb)');
  });

  it('не трогает не-аккорды', () => {
    expect(transposeChord('слово', 2)).toBe('слово');
    expect(transposeChord('1.', 2)).toBe('1.');
    expect(transposeChord('|', 2)).toBe('|');
  });

  it('круговой сдвиг на все 12 полутонов даёт исходную высоту', () => {
    const chords = ['C', 'Cm', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'G/B', 'Am7'];
    for (const chord of chords) {
      const original = noteToSemitone(chord.split('/')[0] as string, 'international');
      for (let shift = 1; shift <= 11; shift += 1) {
        const shifted = transposeChord(chord, shift, { notation: 'international' });
        const back = transposeChord(shifted, 12 - shift, { notation: 'international' });
        expect(noteToSemitone(back.split('/')[0] as string, 'international')).toBe(original);
      }
    }
  });
});

describe('transpose: нотация', () => {
  const germanSong = ['Hm        E', 'строка раз', '      A        B', 'строка два'].join('\n');

  it('в немецкой нотации си = H, си-бемоль = B', () => {
    const up = transposeText(germanSong, 1);
    expect(up.split('\n')[0]).toContain('C');
    expect(up.split('\n')[2]).toContain('H');
  });

  it('международная нотация сохраняет B как си', () => {
    const internationalSong = ['Bm        E', 'строка раз'].join('\n');
    const up = transposeText(internationalSong, 1);
    expect(up.split('\n')[0]).toContain('Cm');
  });

  it('транспонирует тональность и выбирает бемольную запись по кругу', () => {
    expect(transposeKey('C', 2)).toBe('D');
    expect(transposeKey('C', -2)).toBe('Bb');
    expect(transposeKey('G', 2)).toBe('A');
    expect(transposeKey('Bb', 2)).toBe('C');
    expect(transposeKey('H', 1)).toBe('C');
  });
});

describe('renderSong: тональность и капо', () => {
  it('без изменений возвращает исходный текст', () => {
    const result = renderSong({ text: SONG, key: 'Db' });
    expect(result.text).toBe(SONG);
    expect(result.key).toBe('Db');
    expect(result.shapeKey).toBe('Db');
    expect(result.semitones).toBe(0);
  });

  it('переход в другую тональность', () => {
    const result = renderSong({ text: SONG, key: 'Db' }, { targetKey: 'E' });
    expect(result.key).toBe('E');
    expect(result.semitones).toBe(3);
    const firstLine = result.text.split('\n')[0]?.trim().split(/\s+/) ?? [];
    expect(firstLine[0]).toBe('E');
    expect(firstLine[1]).toBe('A');
  });

  it('капо опускает аккорды, тональность остаётся', () => {
    const result = renderSong({ text: ['C   G', 'строка раз'].join('\n'), key: 'C' }, { capo: 2 });
    expect(result.key).toBe('C');
    expect(result.capo).toBe(2);
    expect(result.shapeKey).toBe('Bb');
    expect(result.text.split('\n')[0]).toBe('Bb   F');
    expect(result.text.split('\n')[0]?.length).toBe('C   G'.length + 1);
  });

  it('капо и смена тональности вместе', () => {
    const result = renderSong({ text: ['C   G', 'строка раз'].join('\n'), key: 'C' }, { targetKey: 'D', capo: 2 });
    expect(result.key).toBe('D');
    expect(result.shapeKey).toBe('C');
    expect(result.semitones).toBe(0);
    expect(result.text).toBe(['C   G', 'строка раз'].join('\n'));
  });
});
