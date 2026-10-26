import { detectNotation, isChordLine, noteToSemitone } from '../core/chords';
import { renderSong as buildSongView, transposeKey } from '../core/transpose';
import { toggleFavorite } from '../app/settings';
import { fetchSong } from '../app/site-refresh';
import type { SongFull } from '../db/types';
import type { AppContext } from './app';
import { escapeHtml, songTextHtml } from './html';

const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const CAPO_MAX = 11;

/** Экран песни: аккорды над текстом, транспонирование, капо, автоскролл */
export function renderSong(
  root: HTMLElement,
  context: AppContext,
  songId: number,
  compact: boolean,
): void {
  root.innerHTML = '<div class="list__empty">Загрузка песни…</div>';

  void context.repo
    .get(songId)
    .then((song) => {
      if (!song) {
        root.innerHTML = '<div class="list__empty">Песня не найдена в базе</div>';
        return;
      }
      paint(root, context, song, compact);
    })
    .catch((error: unknown) => {
      root.innerHTML = `<div class="list__empty">Ошибка базы: ${escapeHtml(
        error instanceof Error ? error.message : String(error),
      )}</div>`;
    });
}

function paint(
  root: HTMLElement,
  context: AppContext,
  song: SongFull,
  compact: boolean,
  initial?: { semitones?: number; capo?: number },
): void {
  const notation = detectNotation(song.text);
  let semitones = initial?.semitones ?? 0;
  let capo = initial?.capo ?? 0;
  let showChords = context.settings.showChords;
  let fontSize = context.settings.fontSize;
  let scrolling = false;
  let scrollFrame = 0;

  const isFavorite = (): boolean => context.favorites.includes(song.id);

  root.innerHTML = `
    <div class="song">
      <div class="song__head">
        ${compact ? '<button class="icon-button" id="back" title="Назад" aria-label="Назад">←</button>' : ''}
        <div class="song__titles">
          <h1 class="song__title" id="song-title"></h1>
          <div class="song__meta" id="song-meta"></div>
        </div>
        ${song.origin === 'user' ? '<button class="icon-button" id="delete-song" title="Удалить свою песню" aria-label="Удалить">🗑</button>' : ''}
        <button class="icon-button" id="refresh-song" title="Обновить песню с сайта" aria-label="Обновить песню с сайта">⟳</button>
        <button class="icon-button" id="favorite" title="В избранное" aria-label="В избранное">☆</button>
      </div>

      <div class="toolbar">
        <div class="toolbar__group">
          <button class="button button--icon" id="transpose-down" title="Ниже на полутон">−</button>
          <button class="button button--key" id="key-button" title="Выбрать тональность"><span id="key-label">—</span></button>
          <button class="button button--icon" id="transpose-up" title="Выше на полутон">+</button>
        </div>
        <div class="toolbar__group">
          <label class="toolbar__label" for="capo">Капо</label>
          <select class="select" id="capo">
            <option value="0">нет</option>
            ${Array.from({ length: CAPO_MAX }, (_, index) => `<option value="${index + 1}">+${index + 1}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar__group">
          <button class="button button--icon" id="font-down" title="Меньше шрифт">A−</button>
          <button class="button button--icon" id="font-up" title="Больше шрифт">A+</button>
        </div>
        <div class="toolbar__group">
          <button class="button button--toggle" id="toggle-chords">Аккорды</button>
          <button class="button button--toggle" id="toggle-scroll" title="Автопрокрутка">▶</button>
        </div>
      </div>

      <div class="song__scroll" id="song-scroll">
        <pre class="song__text" id="song-text"></pre>
      </div>
      <div class="song__status" id="song-status" hidden></div>
    </div>
    <div class="keypad-overlay" id="keys-overlay" hidden><div class="keypad" id="keypad"></div></div>
  `;

  const titleEl = requireEl<HTMLElement>(root, '#song-title');
  const metaEl = requireEl<HTMLElement>(root, '#song-meta');
  const keyLabel = requireEl<HTMLElement>(root, '#key-label');
  const textEl = requireEl<HTMLElement>(root, '#song-text');
  const scrollEl = requireEl<HTMLElement>(root, '#song-scroll');
  const favoriteBtn = requireEl<HTMLButtonElement>(root, '#favorite');
  const toggleChordsBtn = requireEl<HTMLButtonElement>(root, '#toggle-chords');
  const toggleScrollBtn = requireEl<HTMLButtonElement>(root, '#toggle-scroll');
  const capoSelect = requireEl<HTMLSelectElement>(root, '#capo');
  const keypad = requireEl<HTMLElement>(root, '#keypad');
  const keysOverlay = requireEl<HTMLElement>(root, '#keys-overlay');

  keypad.innerHTML = `${KEYS.map(
    (key) => `<button class="keypad__key" data-key="${key}">${key}</button>`,
  ).join('')}<button class="keypad__key keypad__key--reset" data-key="">сброс</button>`;

  const update = (): void => {
    const rendered = buildSongView(song, { semitones, capo });
    const displayKey = transposeKey(song.key || rendered.key, semitones, { notation });

    titleEl.textContent = song.title;
    metaEl.textContent = [song.artist, song.album].filter(Boolean).join(' · ');
    keyLabel.textContent = song.key ? displayKey : '—';

    const text = showChords
      ? rendered.text
      : rendered.text
          .split('\n')
          .filter((line) => !isChordLine(line, notation))
          .join('\n');

    textEl.innerHTML = songTextHtml(text, {
      highlightChords: context.settings.highlightChords,
      notation,
    });
    textEl.style.fontSize = `${fontSize}px`;
    textEl.style.columnCount = String(context.settings.columns);
    toggleChordsBtn.classList.toggle('button--toggle-on', showChords);
    favoriteBtn.textContent = isFavorite() ? '★' : '☆';
    favoriteBtn.classList.toggle('icon-button--active', isFavorite());
  };

  root.querySelector<HTMLButtonElement>('#back')?.addEventListener('click', () => context.onBack());

  requireEl<HTMLButtonElement>(root, '#transpose-down').addEventListener('click', () => {
    semitones = (semitones + 11) % 12;
    update();
  });

  requireEl<HTMLButtonElement>(root, '#transpose-up').addEventListener('click', () => {
    semitones = (semitones + 1) % 12;
    update();
  });

  requireEl<HTMLButtonElement>(root, '#key-button').addEventListener('click', () => {
    keysOverlay.hidden = !keysOverlay.hidden;
  });

  keypad.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-key]');
    if (!target) return;

    const key = target.dataset.key ?? '';
    keysOverlay.hidden = true;

    if (!key) {
      semitones = 0;
      update();
      return;
    }

    const baseSemitone = song.key ? noteToSemitone(song.key, notation) : null;
    const targetSemitone = noteToSemitone(key, notation);
    if (baseSemitone !== null && targetSemitone !== null) {
      semitones = (((targetSemitone - baseSemitone) % 12) + 12) % 12;
    }
    update();
  });

  keysOverlay.addEventListener('click', (event) => {
    if (event.target === keysOverlay) keysOverlay.hidden = true;
  });

  requireEl<HTMLButtonElement>(root, '#font-up').addEventListener('click', () => {
    fontSize = Math.min(40, fontSize + 2);
    update();
  });

  requireEl<HTMLButtonElement>(root, '#font-down').addEventListener('click', () => {
    fontSize = Math.max(10, fontSize - 2);
    update();
  });

  toggleChordsBtn.addEventListener('click', () => {
    showChords = !showChords;
    update();
  });

  favoriteBtn.addEventListener('click', () => {
    context.onFavoritesChange(toggleFavorite(song.id));
    update();
  });

  // ---------- удаление своей песни ----------
  root.querySelector<HTMLButtonElement>('#delete-song')?.addEventListener('click', () => {
    if (!window.confirm('Удалить эту песню из базы?')) return;
    void (async () => {
      await context.repo.deleteSong(song.id);
      context.onBack();
    })();
  });

  // ---------- обновление одной песни с сайта ----------
  const refreshBtn = requireEl<HTMLButtonElement>(root, '#refresh-song');
  const statusEl = requireEl<HTMLElement>(root, '#song-status');

  refreshBtn.addEventListener('click', () => {
    void (async () => {
      refreshBtn.disabled = true;
      statusEl.hidden = false;
      statusEl.textContent = 'Скачиваю песню с сайта…';
      try {
        const fresh = await fetchSong(song.id);
        if (!fresh) throw new Error('не удалось разобрать страницу');

        if (fresh.text === song.text && fresh.key === song.key) {
          statusEl.textContent = 'Песня уже совпадает с сайтом';
          return;
        }

        await context.repo.writeDelta({
          fromVersion: '',
          toVersion: new Date().toISOString().slice(0, 10),
          songs: [fresh],
          removed: [],
        });
        paint(root, context, { ...song, ...fresh }, compact, { semitones, capo });

        const freshStatus = root.querySelector<HTMLElement>('#song-status');
        if (freshStatus) {
          freshStatus.hidden = false;
          freshStatus.textContent = 'Песня обновлена с сайта';
        }
      } catch (error) {
        statusEl.textContent = `Не удалось обновить: ${
          error instanceof Error ? error.message : String(error)
        }`;
      } finally {
        refreshBtn.disabled = false;
      }
    })();
  });

  capoSelect.addEventListener('change', () => {
    capo = Number.parseInt(capoSelect.value, 10) || 0;
    update();
  });

  const stopScroll = (): void => {
    scrolling = false;
    cancelAnimationFrame(scrollFrame);
    toggleScrollBtn.textContent = '▶';
    toggleScrollBtn.classList.remove('button--toggle-on');
  };

  const tick = (): void => {
    if (!scrolling) return;
    scrollEl.scrollTop += Math.max(0.5, fontSize / 20);
    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1) {
      stopScroll();
      return;
    }
    scrollFrame = requestAnimationFrame(tick);
  };

  toggleScrollBtn.addEventListener('click', () => {
    scrolling = !scrolling;
    toggleScrollBtn.textContent = scrolling ? '⏸' : '▶';
    toggleScrollBtn.classList.toggle('button--toggle-on', scrolling);
    if (scrolling) {
      scrollFrame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(scrollFrame);
    }
  });

  update();
}

function requireEl<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент ${selector}`);
  return element;
}
