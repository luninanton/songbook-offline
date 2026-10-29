import { chordPianoKeys } from '../core/piano';
import type { Notation } from '../core/chords';
import { escapeHtml } from './html';

/**
 * Клавиатура пианино с подсветкой нот аккорда: две октавы (C3–C5).
 * Рисуется в SVG, поэтому работает офлайн и не зависит от картинок с сайта.
 */
export function pianoDiagramSvg(chord: string, notation: Notation = 'international'): string {
  const keys = chordPianoKeys(chord, notation);

  if (keys.length === 0) {
    return '<div class="chord-sheet__empty"><p>Не удалось определить ноты аккорда.</p></div>';
  }

  const whiteKeys = 15; // C3…C5 включительно
  const whiteWidth = 26;
  const height = 120;
  const blackHeight = 74;
  const blackWidth = 16;
  const width = whiteKeys * whiteWidth;

  const activeWhite = new Set<number>();
  const activeBlack = new Set<number>();
  let bassWhite: number | null = null;
  let bassBlack: number | null = null;

  const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_OFFSETS: Record<number, number> = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 };

  for (const key of keys) {
    const whiteIndex = WHITE_SEMITONES.indexOf(key.semitone);
    if (whiteIndex >= 0) {
      // подсвечиваем обе октавы
      activeWhite.add(whiteIndex);
      activeWhite.add(whiteIndex + 7);
      if (key.isBass) bassWhite = whiteIndex;
    } else {
      activeBlack.add(key.semitone);
      if (key.isBass) bassBlack = key.semitone;
    }
  }

  const parts: string[] = [];

  // белые клавиши
  for (let index = 0; index < whiteKeys; index += 1) {
    const pitch = index % 7;
    const isActive = activeWhite.has(index);
    const isBass = bassWhite !== null && (index === bassWhite || index === bassWhite + 7);
    const x = index * whiteWidth;

    parts.push(
      `<rect x="${x + 0.5}" y="0.5" width="${whiteWidth - 1}" height="${height - 1}" rx="3"
        fill="${isActive ? 'var(--chord)' : '#ffffff'}"
        stroke="${isBass ? 'var(--text)' : '#b9c3bd'}"
        stroke-width="${isBass ? 2.5 : 1}"
        ${isBass ? 'stroke-dasharray="4 3"' : ''} />`,
    );

    // подписи нот на белых клавишах
    const noteName = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][pitch] as string;
    parts.push(
      `<text x="${x + whiteWidth / 2}" y="${height - 10}" text-anchor="middle" font-size="10"
        fill="${isActive ? '#ffffff' : '#6b7a73'}">${noteName}${pitch === 0 ? `<tspan>${3 + index / 7}</tspan>` : ''}</text>`,
    );
  }

  // чёрные клавиши
  for (let index = 0; index < whiteKeys; index += 1) {
    const pitch = index % 7;
    const blackSemitone = BLACK_OFFSETS[pitch];
    if (blackSemitone === undefined) continue;

    const isActive = activeBlack.has(blackSemitone);
    const isBass = bassBlack === blackSemitone;
    const x = index * whiteWidth + whiteWidth - blackWidth / 2;

    parts.push(
      `<rect x="${x}" y="0" width="${blackWidth}" height="${blackHeight}" rx="3"
        fill="${isActive ? 'var(--chord)' : '#22302a'}"
        stroke="${isBass ? 'var(--text)' : 'none'}"
        stroke-width="${isBass ? 2 : 0}"
        ${isBass ? 'stroke-dasharray="3 2"' : ''} />`,
    );
  }

  return `
    <svg class="chord-sheet__svg chord-sheet__svg--piano" viewBox="0 0 ${width} ${height + 8}"
         role="img" aria-label="Клавиши аккорда ${escapeHtml(chord)}">
      ${parts.join('\n      ')}
    </svg>
    <p class="chord-sheet__fingering">${escapeHtml(keys.map((key) => key.note).join(' · '))}</p>
    ${keys.some((key) => key.isBass) ? '<p class="chord-sheet__notes">Пунктиром — бас аккорда</p>' : ''}
  `;
}
