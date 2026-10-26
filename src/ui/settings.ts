import type { AppContext } from './app';
import { escapeHtml } from './html';

/** Панель настроек (открывается поверх экрана) */
export function renderSettings(root: HTMLElement, context: AppContext): void {
  const { settings, meta } = context;

  root.innerHTML = `
    <div class="settings">
      <div class="settings__head">
        <h2 class="settings__title">Настройки</h2>
        <button class="icon-button" id="close-settings" title="Закрыть">✕</button>
      </div>

      <label class="field">
        <span class="field__label">Тема</span>
        <select class="select" id="theme">
          <option value="auto">как в системе</option>
          <option value="light">светлая</option>
          <option value="dark">тёмная</option>
        </select>
      </label>

      <label class="field">
        <span class="field__label">Размер шрифта по умолчанию</span>
        <input class="range" id="font" type="range" min="12" max="28" step="1" value="${settings.fontSize}" />
        <span class="field__hint" id="font-value">${settings.fontSize} px</span>
      </label>

      <label class="field">
        <span class="field__label">Колонок на широком экране</span>
        <select class="select" id="columns">
          <option value="1">одна</option>
          <option value="2">две</option>
          <option value="3">три</option>
        </select>
      </label>

      <label class="field field--row">
        <input type="checkbox" id="show-chords" ${settings.showChords ? 'checked' : ''} />
        <span class="field__label">Показывать аккорды</span>
      </label>

      <div class="settings__section">
        <h3 class="settings__subtitle">База песен</h3>
        <p class="settings__text" id="db-info">—</p>
        <p class="settings__text settings__text--muted">
          Обновление базы из интернета появится на этапе M6: пакеты будут публиковаться
          в GitHub Releases, а новые песни можно будет докачивать прямо с сайта.
        </p>
      </div>

      <p class="settings__text settings__text--muted">
        Приложение работает офлайн. Данные предназначены для личного использования.
      </p>
    </div>
  `;

  const themeSelect = requireEl<HTMLSelectElement>(root, '#theme');
  const fontInput = requireEl<HTMLInputElement>(root, '#font');
  const fontValue = requireEl<HTMLElement>(root, '#font-value');
  const columnsSelect = requireEl<HTMLSelectElement>(root, '#columns');
  const chordsCheckbox = requireEl<HTMLInputElement>(root, '#show-chords');
  const dbInfo = requireEl<HTMLElement>(root, '#db-info');

  themeSelect.value = settings.theme;
  columnsSelect.value = String(settings.columns);

  dbInfo.innerHTML = meta
    ? `Песен: <strong>${meta.count.toLocaleString('ru-RU')}</strong> · с аккордами: <strong>${meta.withChords.toLocaleString('ru-RU')}</strong><br />
       Версия данных: <strong>${escapeHtml(meta.dataVersion)}</strong>`
    : 'База не загружена';

  root.querySelector<HTMLButtonElement>('#close-settings')?.addEventListener('click', () => {
    context.onCloseSettings();
  });

  themeSelect.addEventListener('change', () => {
    context.onSettingsChange({ theme: themeSelect.value as typeof settings.theme });
  });

  fontInput.addEventListener('input', () => {
    fontValue.textContent = `${fontInput.value} px`;
  });
  fontInput.addEventListener('change', () => {
    context.onSettingsChange({ fontSize: Number(fontInput.value) });
  });

  columnsSelect.addEventListener('change', () => {
    context.onSettingsChange({ columns: Number(columnsSelect.value) as 1 | 2 | 3 });
  });

  chordsCheckbox.addEventListener('change', () => {
    context.onSettingsChange({ showChords: chordsCheckbox.checked });
  });
}

function requireEl<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент ${selector}`);
  return element;
}
