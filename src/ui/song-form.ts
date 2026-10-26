import type { NewSongInput } from '../db/types';
import { chordLines, detectNotation } from '../core/chords';
import { escapeHtml } from './html';

/** Тональности для выбора (пустая = не указана) */
const KEYS = ['', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export interface SongFormValues {
  title: string;
  artist: string;
  key: string;
  text: string;
}

export interface SongFormCallbacks {
  /** Заполненные поля — для редактирования существующей песни */
  initial?: SongFormValues;
  onCancel: () => void;
  onSave: (input: NewSongInput) => Promise<void>;
}

/**
 * Форма добавления своей песни: название, исполнитель, тональность и текст с аккордами.
 * Аккорды вводятся как обычно — отдельными строками над словами, выравнивание пробелами.
 */
export function renderSongForm(root: HTMLElement, callbacks: SongFormCallbacks): void {
  root.innerHTML = `
    <div class="settings">
      <div class="settings__head">
        <h2 class="settings__title">${callbacks.initial ? 'Редактировать песню' : 'Своя песня'}</h2>
        <button class="icon-button" id="cancel" title="Отмена">✕</button>
      </div>

      <label class="field">
        <span class="field__label">Название</span>
        <input class="search__input" id="title" type="text" autocomplete="off" placeholder="Например: Великий Бог" />
      </label>

      <label class="field">
        <span class="field__label">Исполнитель или автор (необязательно)</span>
        <input class="search__input" id="artist" type="text" autocomplete="off" placeholder="Например: Народная" />
      </label>

      <label class="field">
        <span class="field__label">Тональность (необязательно)</span>
        <select class="select" id="key">
          ${KEYS.map((key) => `<option value="${key}">${key === '' ? 'не указана' : key}</option>`).join('')}
        </select>
      </label>

      <label class="field">
        <span class="field__label">Текст с аккордами</span>
        <textarea class="form-textarea" id="text" rows="12" spellcheck="false"
          placeholder="Am        C&#10;строка текста&#10;        G          F&#10;ещё строка"></textarea>
      </label>

      <p class="settings__text settings__text--muted" id="form-status">
        Аккорды пишите отдельной строкой над словами — приложение само определит их и включит транспонирование.
      </p>

      <div class="settings__actions">
        <button class="button button--key" id="save" type="button">Сохранить</button>
        <button class="button" id="cancel-2" type="button">Отмена</button>
      </div>
    </div>
  `;

  const titleInput = requireEl<HTMLInputElement>(root, '#title');
  const artistInput = requireEl<HTMLInputElement>(root, '#artist');
  const keySelect = requireEl<HTMLSelectElement>(root, '#key');
  const textArea = requireEl<HTMLTextAreaElement>(root, '#text');
  const status = requireEl<HTMLElement>(root, '#form-status');
  const saveButton = requireEl<HTMLButtonElement>(root, '#save');

  if (callbacks.initial) {
    titleInput.value = callbacks.initial.title;
    artistInput.value = callbacks.initial.artist;
    keySelect.value = callbacks.initial.key;
    textArea.value = callbacks.initial.text;
  }

  const cancel = (): void => callbacks.onCancel();
  requireEl<HTMLButtonElement>(root, '#cancel').addEventListener('click', cancel);
  requireEl<HTMLButtonElement>(root, '#cancel-2').addEventListener('click', cancel);

  // Живая подсказка: показываем, что аккорды распознаны (и сколько строк)
  const updateHint = (): void => {
    const text = textArea.value;
    if (!text.trim()) {
      status.innerHTML =
        'Аккорды пишите отдельной строкой над словами — приложение само определит их и включит транспонирование.';
      return;
    }

    const notation = detectNotation(text);
    const count = chordLines(text, notation).length;

    status.innerHTML =
      count > 0
        ? `<strong>Аккорды распознаны:</strong> ${count} ${plural(count, 'строка', 'строки', 'строк')}. ` +
          'Транспонирование, капо и подсветка будут работать.'
        : 'Аккорды не найдены — песня сохранится как текст. Если нужны аккорды, добавьте строку над словами, например <code>Am   C</code>.';
  };

  textArea.addEventListener('input', updateHint);
  updateHint();

  const save = (): void => {
    void (async () => {
      const title = titleInput.value.trim();
      const text = textArea.value;

      if (!title) {
        status.textContent = 'Введите название песни';
        titleInput.focus();
        return;
      }
      if (!text.trim()) {
        status.textContent = 'Введите текст песни (можно без аккордов)';
        textArea.focus();
        return;
      }

      saveButton.disabled = true;
      status.textContent = 'Сохраняю…';
      try {
        await callbacks.onSave({
          title,
          artist: artistInput.value.trim(),
          key: keySelect.value,
          text,
        });
      } catch (error) {
        saveButton.disabled = false;
        status.innerHTML = `Не удалось сохранить: ${escapeHtml(
          error instanceof Error ? error.message : String(error),
        )}`;
      }
    })();
  };

  saveButton.addEventListener('click', save);
}

function requireEl<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент ${selector}`);
  return element;
}

/** Русское склонение: 1 строка, 2 строки, 5 строк */
function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
