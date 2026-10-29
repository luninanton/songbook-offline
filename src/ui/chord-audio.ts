import { chordPianoKeys } from '../core/piano';
import type { Notation } from '../core/chords';

/**
 * Звук аккорда без аудиофайлов: синтез через WebAudio.
 * Ничего не весит в APK — осцилляторы и огибающая считаются в момент нажатия.
 */
let context: AudioContext | null = null;
let activeNodes: Array<{ stop: () => void }> = [];

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** Частота ноты по полутону от C, с учётом октавы */
function frequency(semitone: number, octave: number): number {
  const midi = 12 * (octave + 1) + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function stopChord(): void {
  for (const node of activeNodes) {
    try {
      node.stop();
    } catch {
      // узел уже остановлен
    }
  }
  activeNodes = [];
}

/**
 * Проигрывает аккорд: арпеджио короткими щелчками.
 * Возвращает false, если WebAudio недоступен (тогда кнопку можно скрыть).
 */
export function playChord(
  chord: string,
  notation: Notation = 'international',
  options: { arpeggio?: boolean } = {},
): boolean {
  const ctx = getContext();
  if (!ctx) return false;

  void ctx.resume();
  stopChord();

  const keys = chordPianoKeys(chord, notation);
  if (keys.length === 0) return false;

  const now = ctx.currentTime;
  const step = options.arpeggio === false ? 0 : 0.09;
  const duration = 1.5;

  keys.forEach((key, index) => {
    const isBass = key.isBass;
    const octave = isBass ? 2 : 4;
    const start = now + index * step;

    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency(key.semitone, octave);

    // мягкая атака и затухание, чтобы звук был похож на клавишный
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(isBass ? 0.35 : 0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    // лёгкий фильтр убирает резкость треугольника
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);

    activeNodes.push({ stop: () => oscillator.stop() });
  });

  return true;
}

/** Есть ли вообще синтез в этом окружении */
export function isAudioAvailable(): boolean {
  return getContext() !== null;
}
