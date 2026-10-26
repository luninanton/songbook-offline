import { describe, expect, it } from 'vitest';
import { songTextHtml } from '../html';

describe('html: подсветка аккордов', () => {
  const song = ['Am        C', 'строка раз', '        F   G', 'строка два'].join('\n');

  it('оборачивает аккорды в span.chord, не меняя колонки', () => {
    const html = songTextHtml(song, { notation: 'international' });
    expect(html).toContain('<span class="chord">Am</span>');
    expect(html).toContain('<span class="chord">C</span>');
    expect(html).toContain('<span class="chord">F</span>');
    // выравнивание сохраняется: пробелы превращаются в &nbsp; и их количество то же
    const firstLine = html.split('\n')[0] as string;
    expect(firstLine.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')).toBe('Am        C');
  });

  it('не трогает строки с текстом', () => {
    const html = songTextHtml(song, { notation: 'international' });
    const lines = html.split('\n');
    expect(lines[1]).toBe('строка&nbsp;раз');
    expect(lines[3]).toBe('строка&nbsp;два');
  });

  it('экранирует потенциально опасные символы', () => {
    const html = songTextHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('умеет отключать подсветку', () => {
    const html = songTextHtml(song, { highlightChords: false });
    expect(html).not.toContain('class="chord"');
    expect(html).toContain('Am');
  });

  it('аккорды в немецкой нотации тоже подсвечиваются', () => {
    const html = songTextHtml(['Hm      E', 'строка раз'].join('\n'));
    expect(html).toContain('<span class="chord">Hm</span>');
    expect(html).toContain('<span class="chord">E</span>');
  });
});
