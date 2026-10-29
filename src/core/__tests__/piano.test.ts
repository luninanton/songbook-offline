import { describe, expect, it } from 'vitest';
import { chordPianoKeys } from '../piano';

describe('piano: клавиши аккорда', () => {
  it('мажорное трезвучие', () => {
    expect(chordPianoKeys('C').map((key) => key.note)).toEqual(['C', 'E', 'G']);
    expect(chordPianoKeys('C').map((key) => key.semitone)).toEqual([0, 4, 7]);
  });

  it('минор и септаккорды', () => {
    expect(chordPianoKeys('Am').map((key) => key.note)).toEqual(['A', 'C', 'E']);
    expect(chordPianoKeys('G7').map((key) => key.note)).toEqual(['G', 'B', 'D', 'F']);
    expect(chordPianoKeys('Cmaj7').map((key) => key.note)).toEqual(['C', 'E', 'G', 'B']);
    expect(chordPianoKeys('Dm7').map((key) => key.note)).toEqual(['D', 'F', 'A', 'C']);
  });

  it('пишет бемоли и диезы как в аккорде', () => {
    expect(chordPianoKeys('Bb').map((key) => key.note)).toEqual(['Bb', 'D', 'F']);
    expect(chordPianoKeys('F#m').map((key) => key.note)).toEqual(['F#', 'A', 'C#']);
  });

  it('понимает немецкую нотацию', () => {
    expect(chordPianoKeys('Hm', 'german').map((key) => key.note)).toEqual(['B', 'D', 'F#']);
  });

  it('подсвечивает бас слэш-аккорда', () => {
    const keys = chordPianoKeys('G/B');
    expect(keys.map((key) => key.note)).toContain('B');
    expect(keys.filter((key) => key.isBass).map((key) => key.note)).toEqual(['B']);
  });

  it('знает редкие аккорды, для которых нет гитарной схемы', () => {
    expect(chordPianoKeys('Cdim').map((key) => key.note)).toEqual(['C', 'Eb', 'Gb']);
    expect(chordPianoKeys('Cadd9').map((key) => key.note)).toEqual(['C', 'E', 'G', 'D']);
  });

  it('не падает на неаккордах', () => {
    expect(chordPianoKeys('слово')).toEqual([]);
  });
});
