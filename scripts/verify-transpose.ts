/**
 * Проверка инвариантов транспонирования на реальной выборке песен.
 *
 *   npx tsx scripts/verify-transpose.ts --in=data/raw/ru-sample.jsonl
 *
 * Для каждой песни и каждого сдвига 1…11 проверяем:
 *  - число строк не изменилось;
 *  - строки без аккордов не изменились побайтово;
 *  - аккордовые строки остались аккордовыми, число аккордов и их высота сдвинулись ровно на сдвиг;
 *  - сдвиг на 12 возвращает текст байт-в-байт.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { detectNotation, extractChords, isChordLine } from '../src/core/chords';
import { transposeText } from '../src/core/transpose';

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main(): Promise<void> {
  const file = resolve(arg('in', 'data/raw/ru.jsonl'));
  const maxSongs = Number.parseInt(arg('limit', '0'), 10) || 0;
  if (!existsSync(file)) throw new Error(`Нет файла: ${file}`);

  let checked = 0;
  let shiftsChecked = 0;
  const failures: Array<{ id: number; shift: number; reason: string }> = [];
  const startedAt = Date.now();

  const reader = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });

  for await (const line of reader) {
    if (!line.trim()) continue;
    const song = JSON.parse(line) as { id: number; text: string; key: string };
    if (!song.text.trim()) continue;
    if (maxSongs && checked >= maxSongs) break;

    checked += 1;
    const notation = detectNotation(song.text);
    const originalLines = song.text.split('\n');

    // сдвиг на октаву — текст должен совпасть побайтово
    if (transposeText(song.text, 12) !== song.text) {
      failures.push({ id: song.id, shift: 12, reason: 'сдвиг на 12 изменил текст' });
    }
    if (transposeText(song.text, -12) !== song.text) {
      failures.push({ id: song.id, shift: -12, reason: 'сдвиг на -12 изменил текст' });
    }

    for (let shift = 1; shift <= 11; shift += 1) {
      shiftsChecked += 1;
      const shiftedLines = transposeText(song.text, shift).split('\n');

      if (shiftedLines.length !== originalLines.length) {
        failures.push({ id: song.id, shift, reason: 'изменилось число строк' });
        continue;
      }

      let broken = false;
      for (let index = 0; index < originalLines.length; index += 1) {
        const before = originalLines[index] as string;
        const after = shiftedLines[index] as string;

        if (!isChordLine(before, notation)) {
          if (before !== after) {
            failures.push({ id: song.id, shift, reason: `изменена неаккордовая строка ${index + 1}` });
            broken = true;
            break;
          }
          continue;
        }

        const chordsBefore = extractChords(before, notation);
        const chordsAfter = extractChords(after, notation);

        if (chordsBefore.length !== chordsAfter.length) {
          failures.push({ id: song.id, shift, reason: `строка ${index + 1}: пропали аккорды` });
          broken = true;
          break;
        }

        for (let chordIndex = 0; chordIndex < chordsBefore.length; chordIndex += 1) {
          const a = chordsBefore[chordIndex] as (typeof chordsBefore)[number];
          const b = chordsAfter[chordIndex] as (typeof chordsAfter)[number];
          const expectedRoot = (a.rootSemitone + shift) % 12;
          if (b.rootSemitone !== expectedRoot) {
            failures.push({
              id: song.id,
              shift,
              reason: `строка ${index + 1}: высота аккорда ${a.raw} → ${b.raw} не равна +${shift}`,
            });
            broken = true;
            break;
          }
          if (a.bassSemitone !== null) {
            const expectedBass = (a.bassSemitone + shift) % 12;
            if (b.bassSemitone !== expectedBass) {
              failures.push({ id: song.id, shift, reason: `строка ${index + 1}: бас ${a.raw} сдвинут неверно` });
              broken = true;
              break;
            }
          }
        }
        if (broken) break;
      }
      if (failures.length > 50) break;
    }
    if (failures.length > 50) break;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Проверено песен: ${checked}, сдвигов: ${shiftsChecked}, время: ${elapsed} c`);
  console.log(`Нарушений: ${failures.length}`);
  for (const failure of failures.slice(0, 15)) {
    console.log(`  id=${failure.id} shift=${failure.shift}: ${failure.reason}`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Проверка прервана:', error);
  process.exitCode = 1;
});
