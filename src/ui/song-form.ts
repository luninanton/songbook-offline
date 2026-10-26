import type { NewSongInput } from '../db/types';
import { escapeHtml } from './html';

/** Тональности для выбора (пустая = не указана) */
const KEYS = ['', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export interface SongFormCallbacks {
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
        <h2 class="settings__title">Своя песня</h2>
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

  const cancel = (): void => callbacks.onCancel();
  requireEl<HTMLButtonElement>(root, '#cancel').addEventListener('click', cancel);
  requireEl<HTMLButtonElement>(root, '#cancel-2').addEventListener('click', cancel);

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
