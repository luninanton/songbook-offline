import { describe, expect, it } from 'vitest';
import { chordLines, detectNotation, hasChords, isChordLine, normalizeNote, parseChordToken } from '../chords';
import { ParseError, decodeEntities, extractPreText, parseSongPage } from '../parser';

/**
 * Фикстуры синтетические: структура разметки как на сайте,
 * но текст — вымышленный, без реальных текстов песен.
 */
function page(options: { text: string; key?: string; name?: string; album?: string }): string {
  const key = options.key ?? 'Db';
  const classAttr = key ? ` class="${key}"` : '';
  return `<!doctype html><html><head>
<title>Тестовый исполнитель Тестовая песня | Слова | Аккорды</title>
<meta itemprop="name" content="${options.name ?? 'Тестовый исполнитель - Тестовая песня'}" />
<meta itemprop="datePublished" content="2026-10-23 21:53:07+03:00" />
<meta itemprop="dateModified" content="2026-10-24 19:26:22+03:00" />
<script>window.music = { id: 4321, feat: '' };</script>
<script>window.album = { id: 99 };</script>
<script>window.artist = { id: 77 };</script>
</head><body>
<div id="music_viewer">
  <div class="media my-3">
    <div class="media-body text-truncate">
      <a>${options.album ?? 'Сборник тестов'}</a>
      <div class="text-muted">Тестовый исполнитель</div>
    </div>
  </div>
  <pre id="music_text"${classAttr} itemprop="lyrics">${options.text}</pre>
</div></body></html>`;
}

describe('parser: разметка страницы', () => {
  it('извлекает id, тональность, исполнителя, альбом и даты', () => {
    const html = page({ text: 'Db  Gb\nстрока раз\n' });
    const { song, warnings } = parseSongPage(html, { lang: 'ru' });

    expect(song.id).toBe(4321);
    expect(song.key).toBe('Db');
    expect(song.title).toBe('Тестовая песня');
    expect(song.artist).toBe('Тестовый исполнитель');
    expect(song.artistId).toBe(77);
    expect(song.albumId).toBe(99);
    expect(song.album).toBe('Сборник тестов');
    expect(song.lang).toBe('ru');
    expect(song.publishedAt).toContain('2026-10-23');
    expect(song.modifiedAt).toContain('2026-10-24');
    expect(warnings).toEqual([]);
  });

  it('id из URL приоритетнее window.music', () => {
    const html = page({ text: 'Db\nстрока раз\n' });
    expect(parseSongPage(html, { id: 123456 }).song.id).toBe(123456);
  });

  it('бросает ParseError, если нет блока с текстом', () => {
    const html = '<html><body><div id="content_none">нет песни</div></body></html>';
    expect(() => parseSongPage(html)).toThrowError(ParseError);
    try {
      parseSongPage(html);
    } catch (error) {
      expect((error as ParseError).reason).toBe('deleted');
    }
  });

  it('предупреждает о пустом тексте и отсутствии тональности', () => {
    const html = page({ text: '   ', key: '' });
    const { warnings } = parseSongPage(html);
    expect(warnings).toContain('не определена тональность');
    expect(warnings).toContain('пустой текст песни');
  });
});

describe('parser: текст песни', () => {
  it('сохраняет пробелы и переводы строк (выравнивание аккордов)', () => {
    const original = '      Db        Gb\nслово слово слово\n\n  Ab\nслово слово\n';
    const { song } = parseSongPage(page({ text: original }));
    expect(song.text).toBe(original);
  });

  it('снимает теги и декодирует сущности', () => {
    expect(decodeEntities('A &amp; B &#171;тест&#187;')).toBe('A & B «тест»');
    expect(extractPreText('A<br>B &amp; C')).toBe('A\nB & C');
  });

  it('определяет наличие аккордов', () => {
    expect(parseSongPage(page({ text: 'Db  Gb\nстрока раз\n' })).song.hasChords).toBe(true);
    expect(parseSongPage(page({ text: 'просто слова\nещё строка\n' })).song.hasChords).toBe(false);
  });

  it('хэш стабилен и меняется при правке текста', () => {
    const a = parseSongPage(page({ text: 'Db\nслово раз\n' })).song.hash;
    const b = parseSongPage(page({ text: 'Db\nслово раз\n' })).song.hash;
    const c = parseSongPage(page({ text: 'Db\nслово два\n' })).song.hash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('chords: распознавание', () => {
  it('нормализует немецкую нотацию', () => {
    expect(normalizeNote('H')).toBe('B');
    expect(normalizeNote('B')).toBe('Bb');
    expect(normalizeNote('Bb')).toBe('Bb');
    expect(normalizeNote('F#')).toBe('F#');
    expect(normalizeNote('B', 'international')).toBe('B');
    expect(normalizeNote('H', 'international')).toBe('B');
  });

  it('определяет нотацию по тексту песни', () => {
    expect(detectNotation('Hm  E  A')).toBe('german');
    expect(detectNotation('Bm  E  A')).toBe('international');
    expect(detectNotation('слово слово Hello world')).toBe('international');
  });

  it('разбирает аккорды с модификаторами и басом', () => {
    expect(parseChordToken('Am7')?.suffix).toBe('m7');
    expect(parseChordToken('Cmaj7')?.suffix).toBe('maj7');
    expect(parseChordToken('Dsus4')?.suffix).toBe('sus4');
    expect(parseChordToken('G/B')?.bass).toBe('Bb');
    expect(parseChordToken('G/B', 'international')?.bass).toBe('B');
    expect(parseChordToken('Hm')).toMatchObject({ root: 'B', suffix: 'm' });
    expect(parseChordToken('слово')).toBeNull();
  });

  it('не считает аккордовой строкой обычный текст', () => {
    expect(isChordLine('слово слово слово')).toBe(false);
    expect(isChordLine('Db  Gb  Ab')).toBe(true);
    expect(isChordLine('  | Db /// | Gb /// |')).toBe(true);
    expect(isChordLine('Интро:')).toBe(false);
  });

  it('находит аккордовые строки в тексте', () => {
    const text = 'Интро:\nDb  Gb\n\n1 куплет\nслово слово\nAb\n';
    expect(chordLines(text)).toEqual(['Db  Gb', 'Ab']);
    expect(hasChords(text)).toBe(true);
    expect(hasChords('только слова\nи ещё слова\n')).toBe(false);
  });
});
