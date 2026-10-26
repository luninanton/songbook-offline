import { describe, expect, it } from 'vitest';
import { detectKeyFromText, normalizeSongText } from '../song-text';

describe('song-text: нормализация текста', () => {
  it('заменяет табы на пробелы и убирает пробелы в конце строк', () => {
    expect(normalizeSongText('Am\t\tC   \nстрока  ')).toBe('Am        C\nстрока');
  });

  it('сохраняет выравнивание аккордов', () => {
    const source = '    Am        C\nстрока раз';
    expect(normalizeSongText(source)).toBe(source);
  });

  it('схлопывает лишние пустые строки и убирает хвост', () => {
    expect(normalizeSongText('строка\n\n\n\nещё\n\n\n')).toBe('строка\n\nещё');
  });

  it('приводит переводы строк к \\n', () => {
    expect(normalizeSongText('раз\r\nдва\rтри')).toBe('раз\nдва\nтри');
  });
});

describe('song-text: тональность по первому аккорду', () => {
  it('берёт первый аккорд первой аккордовой строки', () => {
    expect(detectKeyFromText('Am        C\nстрока раз')).toBe('Am');
    expect(detectKeyFromText('Интро:\n  Dm  Bb\nстрока')).toBe('Dm');
  });

  it('понимает немецкую нотацию', () => {
    expect(detectKeyFromText('Hm      E\nстрока раз')).toBe('Hm');
  });

  it('возвращает пустую строку, если аккордов нет', () => {
    expect(detectKeyFromText('только слова\nи ещё')).toBe('');
    expect(detectKeyFromText('')).toBe('');
  });
});
