import { chordPianoKeys } from '../core/piano';
import type { Notation } from '../core/chords';

/**
 * Звук аккорда без аудиофайлов: синтез через WebAudio.
 * Ничего не весит в APK — осцилляторы, огибающая и реверберация
 * (импульс генерируется шумом) считаются в момент нажатия.
 */
let context: AudioContext | null = null;
let master: GainNode | null = null;
let reverbSend: GainNode | null = null;
let activeNodes: Array<{ stop: () => void }> = [];

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** Частота ноты по полутону от C, с учётом октавы */
function frequency(semitone: number, octave: number): number {
  const midi = 12 * (octave + 1) + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Импульс для реверберации: короткий шум с экспоненциальным затуханием.
 * Генерируется в памяти, поэтому «комната» не занимает места в APK.
 */
function createImpulse(ctx: AudioContext, seconds = 1.6): AudioBuffer | null {
  if (typeof ctx.createBuffer !== 'function') return null;

  const rate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const decay = Math.pow(1 - index / length, 2.4);
      data[index] = (Math.random() * 2 - 1) * decay;
    }
  }

  return impulse;
}

/** Готовит общую шину: мастер-громкость и посыл в реверберацию */
function ensureBus(ctx: AudioContext): void {
  if (master) return;

  master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.22;

  if (typeof ctx.createConvolver === 'function') {
    const convolver = ctx.createConvolver();
    const impulse = createImpulse(ctx);
    if (impulse) convolver.buffer = impulse;

    const wet = ctx.createGain();
    wet.gain.value = 0.5;

    reverbSend.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);
  } else {
    reverbSend.connect(master);
  }
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
 * Проигрывает аккорд: мягкая атака, затухание и немного «комнаты».
 * Возвращает false, если WebAudio недоступен (тогда кнопку можно скрыть).
 */
export function playChord(
  chord: string,
  notation: Notation = 'international',
  options: { arpeggio?: boolean; duration?: number } = {},
): boolean {
  const ctx = getContext();
  if (!ctx) return false;

  void ctx.resume();
  stopChord();

  const keys = chordPianoKeys(chord, notation);
  if (keys.length === 0) return false;

  ensureBus(ctx);
  const bus = master;
  const send = reverbSend;
  if (!bus) return false;

  const now = ctx.currentTime;
  const step = options.arpeggio === false ? 0 : 0.085;
  const duration = options.duration ?? 1.9;

  keys.forEach((key, index) => {
    const isBass = key.isBass;
    const octave = isBass ? 2 : 4;
    const start = now + index * step;

    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency(key.semitone, octave);

    // мягкая атака (30 мс) вместо щелчка, затем плавное затухание
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(isBass ? 0.3 : 0.22, start + 0.03);
    envelope.gain.exponentialRampToValueAtTime(isBass ? 0.12 : 0.09, start + 0.35);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    // фильтр закрывается со временем: звук глохнет, как у клавишных
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, start);
    filter.frequency.exponentialRampToValueAtTime(900, start + duration);

    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus);
    if (send) envelope.connect(send);

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
