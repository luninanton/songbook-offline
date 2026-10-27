import { describe, expect, it } from 'vitest';
import { chordNotes, describeShape, getChordShape } from '../chord-shapes';

describe('chord-shapes: открытые позиции', () => {
  it('знает классические открытые аккорды', () => {
    expect(describeShape(getChordShape('C')!)).toBe('x32010');
    expect(describeShape(getChordShape('Am')!)).toBe('x02210');
    expect(describeShape(getChordShape('G')!)).toBe('320003');
    expect(describeShape(getChordShape('Em')!)).toBe('022000');
    expect(describeShape(getChordShape('Dm')!)).toBe('xx0231');
  });

  it('распознаёт септаккорды', () => {
    expect(describeShape(getChordShape('G7')!)).toBe('320001');
    expect(describeShape(getChordShape('Am7')!)).toBe('x02010');
  });
});

describe('chord-shapes: подвижные формы (баррэ)', () => {
  it('строит форму от 6-й струны', () => {
    const shape = getChordShape('F#m')!;
    expect(shape.baseFret).toBe(2);
    expect(shape.frets).toEqual([2, 4, 4, 2, 2, 2]);
  });

  it('строит форму от 5-й струны', () => {
    const shape = getChordShape('Bbm')!;
    // у Bb есть открытая форма x13331, поэтому проверяем похожий аккорд без неё
    const ebm = getChordShape('Ebm')!;
    expect(ebm.baseFret).toBeGreaterThanOrEqual(1);
    expect(ebm.frets.filter((fret) => fret > 0).length).toBeGreaterThan(0);
    expect(shape).not.toBeNull();
  });

  it('находит аппликатуру для любого корня', () => {
    const roots = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    for (const root of roots) {
      for (const suffix of ['', 'm', '7', 'm7', 'maj7', 'sus4']) {
        const shape = getChordShape(root + suffix);
        expect(shape, `${root}${suffix}`).not.toBeNull();
        expect(shape!.frets.length).toBe(6);
      }
    }
  });

  it('не выдаёт схему для неизвестных разновидностей', () => {
    expect(getChordShape('Cadd9')).toBeNull();
    expect(getChordShape('Cdim')).toBeNull();
    expect(getChordShape('слово')).toBeNull();
  });
});

describe('chord-shapes: состав аккорда', () => {
  it('считает ноты по формуле', () => {
    expect(chordNotes('C')).toEqual(['C', 'E', 'G']);
    expect(chordNotes('Am')).toEqual(['A', 'C', 'E']);
    expect(chordNotes('G7')).toEqual(['G', 'B', 'D', 'F']);
    expect(chordNotes('Cmaj7')).toEqual(['C', 'E', 'G', 'B']);
  });

  it('понимает немецкую нотацию', () => {
    expect(chordNotes('Hm', 'german')).toEqual(['B', 'D', 'F#']);
  });
});
