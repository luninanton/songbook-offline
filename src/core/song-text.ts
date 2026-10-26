import { detectNotation, extractChords, isChordLine } from './chords';

/**
 * Приведение вставленного текста к аккуратному виду.
 *
 * Правила выбраны так, чтобы НЕ ломать выравнивание аккордов над словами:
 *  - табы заменяются четырьмя пробелами (табы в моноширинном шрифте разной ширины);
 *  - убираются пробелы в конце строк (на выравнивание не влияют, только мешают);
 *  - три и более пустых строки схлопываются в одну, хвостовые пустые строки удаляются.
 */
export function normalizeSongText(input: string): string {
  const lines = input
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n')
    .map((line) => line.replace(/[ ]+$/, ''));

  const collapsed: string[] = [];
  let blankRun = 0;

  for (const line of lines) {
    if (line === '') {
      blankRun += 1;
      if (blankRun > 1) continue;
    } else {
      blankRun = 0;
    }
    collapsed.push(line);
  }

  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') collapsed.pop();

  return collapsed.join('\n');
}

/**
 * Тональность по первому аккорду текста: первая аккордовая строка → первый аккорд.
 * Нужна, чтобы не выбирать тональность вручную при добавлении своей песни.
 */
export function detectKeyFromText(text: string): string {
  if (!text.trim()) return '';

  const notation = detectNotation(text);
  for (const line of text.split('\n')) {
    if (!isChordLine(line, notation)) continue;
    const first = extractChords(line, notation)[0];
    if (!first) continue;
    // Берём запись как в тексте (Am, Hm, D/F#), убирая служебные символы вокруг
    return first.raw.replace(/^[|(]+/, '').replace(/[|)]+$|[.,;:]+$/, '');
  }

  return '';
}
