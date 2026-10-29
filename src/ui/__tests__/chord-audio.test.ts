// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { isAudioAvailable, playChord, stopChord } from '../chord-audio';

/**
 * Проверка синтеза без настоящего звука: подменяем AudioContext заглушкой
 * и смотрим, какие частоты и сколько осцилляторов создаётся.
 */
class FakeParam {
  value = 0;
  setValueAtTime(): this {
    return this;
  }
  exponentialRampToValueAtTime(): this {
    return this;
  }
}

class FakeNode {
  connect(): this {
    return this;
  }
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  started = false;
  stopped = false;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

const created: FakeOscillator[] = [];

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = new FakeNode();
  resume(): Promise<void> {
    return Promise.resolve();
  }
  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    created.push(oscillator);
    return oscillator;
  }
  createGain(): FakeNode & { gain: FakeParam } {
    const node = new FakeNode() as FakeNode & { gain: FakeParam };
    node.gain = new FakeParam();
    return node;
  }
  createBiquadFilter(): FakeNode & { type: string; frequency: FakeParam } {
    const node = new FakeNode() as FakeNode & { type: string; frequency: FakeParam };
    node.type = 'lowpass';
    node.frequency = new FakeParam();
    return node;
  }
}

describe('chord-audio: синтез аккорда', () => {
  it('без AudioContext синтез недоступен', () => {
    expect(isAudioAvailable()).toBe(false);
    expect(playChord('C')).toBe(false);
  });

  it('играет три ноты мажорного трезвучия с верными частотами', () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    created.length = 0;

    expect(playChord('C')).toBe(true);
    expect(created).toHaveLength(3);

    const frequencies = created.map((oscillator) => Math.round(oscillator.frequency.value));
    expect(frequencies).toEqual([262, 330, 392]); // C4, E4, G4
    expect(created.every((oscillator) => oscillator.started)).toBe(true);
  });

  it('для слэш-аккорда добавляет бас на октаву ниже', () => {
    created.length = 0;
    expect(playChord('G/B')).toBe(true);
    expect(created).toHaveLength(4);

    const lowest = Math.min(...created.map((oscillator) => oscillator.frequency.value));
    expect(Math.round(lowest)).toBe(123); // B2
  });

  it('останавливает предыдущий аккорд перед новым', () => {
    created.length = 0;
    playChord('Am');
    const first = [...created];
    playChord('Dm');

    expect(first.every((oscillator) => oscillator.stopped)).toBe(true);
  });

  it('stopChord глушит звук', () => {
    created.length = 0;
    playChord('Em');
    stopChord();
    expect(created.every((oscillator) => oscillator.stopped)).toBe(true);

    beforeEach(() => {
      created.length = 0;
    });
  });
});
