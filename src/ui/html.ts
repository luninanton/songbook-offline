import { detectNotation, isChordLine, parseChordToken, type Notation } from '../core/chords';

/** Экранирование текста перед вставкой в HTML */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Пробелы → неразрывные: иначе WebView «съедает» выравнивание аккордов */
function keepSpaces(value: string): string {
  return value.replace(/ /g, '&nbsp;');
}

export interface RenderTextOptions {
  /** Подсвечивать аккорды цветом */
  highlightChords?: boolean;
  notation?: Notation;
}

/**
 * Текст песни для <pre>: пробелы и переводы строк сохраняются.
 * При подсветке каждый аккорд оборачивается в <span class="chord"> —
 * на выравнивание это не влияет, потому что span не добавляет отступов.
 */
export function songTextHtml(text: string, options: RenderTextOptions = {}): string {
  const highlight = options.highlightChords ?? true;
  if (!highlight) return keepSpaces(escapeHtml(text));

  const notation = options.notation ?? detectNotation(text);

  return text
    .split('\n')
    .map((line) => {
      if (!isChordLine(line, notation)) return keepSpaces(escapeHtml(line));

      return line
        .split(/(\s+)/)
        .map((part) => {
          if (part === '' || /^\s+$/.test(part)) return keepSpaces(part);
          const chord = parseChordToken(part, notation);
          return chord
            ? `<span class="chord">${escapeHtml(part)}</span>`
            : keepSpaces(escapeHtml(part));
        })
        .join('');
    })
    .join('\n');
}
