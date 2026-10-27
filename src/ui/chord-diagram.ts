import { chordNotes, describeShape, getChordShape } from '../core/chord-shapes';
import type { Notation } from '../core/chords';
import { escapeHtml } from './html';

/**
 * Рисует диаграмму аккорда в SVG: сетка ладов, точки, баррэ, отметки открытых
 * и заглушённых струн. Всё генерируется на месте — картинки из сети не нужны.
 */
export function chordDiagramSvg(chord: string, notation: Notation = 'international'): string {
  const shape = getChordShape(chord, notation);
  const notes = chordNotes(chord, notation);
  const notesLine = notes.length > 0 ? notes.join(' · ') : '';

  if (!shape) {
    return `
      <div class="chord-sheet__empty">
        <p>Схема для этого аккорда не подобрана автоматически.</p>
        ${notesLine ? `<p class="chord-sheet__notes">Состав: ${escapeHtml(notesLine)}</p>` : ''}
      </div>
    `;
  }

  const strings = 6;
  const fretsShown = 5;
  const width = 190;
  const height = 230;
  const left = 28;
  const top = 34;
  const stringGap = (width - left * 2) / (strings - 1);
  const fretGap = (height - top - 26) / fretsShown;

  const stringX = (index: number): number => left + index * stringGap;
  const fretY = (fret: number): number => top + fret * fretGap;

  // Абсолютные лады приводим к относительным внутри окна диаграммы
  const baseFret = shape.baseFret;
  const relative = shape.frets.map((fret) => (fret === -1 || fret === 0 ? fret : fret - baseFret + 1));

  const parts: string[] = [];

  // сетка ладов
  for (let fret = 0; fret <= fretsShown; fret += 1) {
    const y = fretY(fret);
    const isNut = fret === 0 && baseFret === 1;
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${width - left}" y2="${y}" stroke="currentColor" stroke-width="${isNut ? 4 : 1.5}" opacity="${isNut ? 1 : 0.35}" />`,
    );
  }

  // струны
  for (let index = 0; index < strings; index += 1) {
    parts.push(
      `<line x1="${stringX(index)}" y1="${top}" x2="${stringX(index)}" y2="${fretY(fretsShown)}" stroke="currentColor" stroke-width="1.5" opacity="0.35" />`,
    );
  }

  // отметки над струнами: x — не играется, o — открытая
  shape.frets.forEach((fret, index) => {
    const x = stringX(index);
    if (fret === -1) {
      parts.push(
        `<text x="${x}" y="${top - 12}" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.6">×</text>`,
      );
    } else if (fret === 0) {
      parts.push(
        `<circle cx="${x}" cy="${top - 16}" r="4" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.7" />`,
      );
    }
  });

  // номер лада, если окно не у порожка
  if (baseFret > 1) {
    parts.push(
      `<text x="${left - 10}" y="${fretY(1) + 4}" text-anchor="end" font-size="12" fill="currentColor" opacity="0.7">${baseFret}</text>`,
    );
  }

  // баррэ: если на первом ладу окна несколько струн — рисуем перекладину
  const barreIndexes = relative
    .map((fret, index) => (fret === 1 ? index : -1))
    .filter((index) => index >= 0);

  if (barreIndexes.length >= 2) {
    const from = Math.min(...barreIndexes);
    const to = Math.max(...barreIndexes);
    const y = fretY(1) - fretGap / 2;
    parts.push(
      `<rect x="${stringX(from) - 9}" y="${y - 9}" width="${stringX(to) - stringX(from) + 18}" height="18" rx="9" fill="var(--chord)" opacity="0.85" />`,
    );
  } else {
    // одиночные точки
    relative.forEach((fret, index) => {
      if (fret <= 0) return;
      parts.push(
        `<circle cx="${stringX(index)}" cy="${fretY(fret) - fretGap / 2}" r="8" fill="var(--chord)" />`,
      );
    });
  }

  // точки поверх баррэ (струны, зажатые выше первого лада окна)
  relative.forEach((fret, index) => {
    if (fret <= 1) return;
    parts.push(
      `<circle cx="${stringX(index)}" cy="${fretY(fret) - fretGap / 2}" r="8" fill="var(--chord)" />`,
    );
  });

  return `
    <svg class="chord-sheet__svg" viewBox="0 0 ${width} ${height}" role="img"
         aria-label="Аппликатура ${escapeHtml(chord)} — ${escapeHtml(describeShape(shape))}">
      ${parts.join('\n      ')}
    </svg>
    <p class="chord-sheet__fingering">${escapeHtml(describeShape(shape))}</p>
    ${notesLine ? `<p class="chord-sheet__notes">Состав: ${escapeHtml(notesLine)}</p>` : ''}
  `;
}
