import type { AppContext } from './app';
import { escapeHtml } from './html';
import { fetchNewSongs, scanAllSongs } from '../app/site-refresh';
import { describeDelta, readDeltaFile } from '../app/update-file';

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
      </div>

      <div class="settings__section">
        <h3 class="settings__subtitle">Обновление с сайта</h3>
        <div class="settings__actions">
          <button class="button button--key" id="update-site" type="button">Обновить с сайта</button>
          <button class="button" id="deep-scan" type="button">Обновить избранное</button>
          <button class="button" id="stop-update" type="button" hidden>Остановить</button>
        </div>
        <p class="settings__text" id="update-status">Новые песни скачиваются быстро.</p>
        <p class="settings__text settings__text--muted">
          «Обновить избранное» перекачивает только отмеченные песни — так подхватываются
          правки текста. Массовое обновление всей базы делается на компьютере и приходит
          с новой версией APK: полный обход каталога с телефона — это гигабайты трафика.
        </p>
      </div>

      <div class="settings__section">
        <h3 class="settings__subtitle">Дополнительно</h3>
        <div class="settings__actions">
          <button class="button" id="import-file" type="button">Обновить из файла</button>
          <input id="delta-file" type="file" accept=".gz,application/gzip" hidden />
        </div>
        <p class="settings__text settings__text--muted" id="sync-status">
          Файл нужен, если интернет недоступен: пакет собирается на компьютере.
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

  const updateButton = requireEl<HTMLButtonElement>(root, '#update-site');
  const deepButton = requireEl<HTMLButtonElement>(root, '#deep-scan');
  const stopButton = requireEl<HTMLButtonElement>(root, '#stop-update');
  const updateStatus = requireEl<HTMLElement>(root, '#update-status');
  const importButton = requireEl<HTMLButtonElement>(root, '#import-file');
  const fileInput = requireEl<HTMLInputElement>(root, '#delta-file');
  const syncStatus = requireEl<HTMLElement>(root, '#sync-status');

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

  // ---------- обновление с сайта ----------
  let cancelled = false;

  const setBusy = (busy: boolean): void => {
    updateButton.disabled = busy;
    deepButton.disabled = busy;
    stopButton.hidden = !busy;
  };

  const today = (): string => new Date().toISOString().slice(0, 10);

  updateButton.addEventListener('click', () => {
    void (async () => {
      cancelled = false;
      setBusy(true);
      try {
        const hashes = await context.repo.allHashes();
        const localIds = new Set(hashes.keys());
        updateStatus.textContent = 'Смотрю список новых песен на сайте…';
        const result = await fetchNewSongs({
          localIds,
          pages: 3,
          maxSongs: 30,
          isCancelled: () => cancelled,
        });

        if (result.songs.length === 0) {
          updateStatus.textContent = 'Новых песен нет — база актуальна';
          return;
        }

        updateStatus.textContent = `Скачал ${result.songs.length} новых песен, добавляю в базу…`;
        const applied = await context.repo.writeDelta({
          fromVersion: '',
          toVersion: today(),
          songs: result.songs,
          removed: [],
        });
        updateStatus.textContent = `Готово: добавлено ${applied.upserted}, всего в базе ${applied.total}.`;
        context.meta = await context.repo.meta();
      } catch (error) {
        updateStatus.textContent = `Не удалось обновить: ${errorMessage(error)}`;
      } finally {
        setBusy(false);
      }
    })();
  });

  deepButton.addEventListener('click', () => {
    void (async () => {
      cancelled = false;
      setBusy(true);
      try {
        const ids = context.favorites.slice();
        if (ids.length === 0) {
          updateStatus.textContent = 'В избранном нет песен — отметьте нужные звездой';
          return;
        }

        const hashes = await context.repo.allHashes();
        updateStatus.textContent = `Проверяю ${ids.length} песен из избранного…`;

        const scan = await scanAllSongs({
          ids,
          localHashes: hashes,
          concurrency: 3,
          isCancelled: () => cancelled,
          onProgress: (progress) => {
            updateStatus.textContent =
              `Проверено ${progress.scanned} из ${progress.total}, ` +
              `изменено ${progress.changed}, ошибок ${progress.failed}…`;
          },
        });

        if (scan.songs.length === 0) {
          updateStatus.textContent = scan.cancelled
            ? `Остановлено: проверено ${scan.scanned} песен, изменений нет`
            : 'Избранные песни совпадают с сайтом';
          return;
        }

        updateStatus.textContent = `Применяю: изменённых ${scan.songs.length}…`;
        const applied = await context.repo.writeDelta({
          fromVersion: '',
          toVersion: today(),
          songs: scan.songs,
          removed: [],
        });
        updateStatus.textContent =
          `Готово: обновлено ${applied.upserted}, удалено ${applied.removed}, всего ${applied.total}.` +
          (scan.cancelled ? ' (проверка была остановлена)' : '');
        context.meta = await context.repo.meta();
      } catch (error) {
        updateStatus.textContent = `Не удалось обновить: ${errorMessage(error)}`;
      } finally {
        setBusy(false);
      }
    })();
  });

  stopButton.addEventListener('click', () => {
    cancelled = true;
    updateStatus.textContent = 'Останавливаю…';
  });

  // ---------- импорт пакета обновления из файла (резервный режим) ----------
  importButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    void (async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      importButton.disabled = true;
      syncStatus.textContent = `Читаю ${file.name}…`;
      try {
        const pack = await readDeltaFile(file);
        syncStatus.textContent = `Применяю: ${describeDelta(pack)}…`;
        const result = await context.repo.writeDelta(pack);
        syncStatus.textContent =
          `Готово: обновлено ${result.upserted}, удалено ${result.removed}, всего ${result.total}.`;
        context.meta = await context.repo.meta();
      } catch (error) {
        syncStatus.textContent = `Не удалось применить файл: ${errorMessage(error)}`;
      } finally {
        importButton.disabled = false;
        fileInput.value = '';
      }
    })();
  });
}

function requireEl<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент ${selector}`);
  return element;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

