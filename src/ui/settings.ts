import type { AppContext } from './app';
import { escapeHtml } from './html';
import { fetchNewSongs } from '../app/site-sync';
import {
  parseDeltaPack,
  parseManifest,
  planUpdate,
  type UpdateManifest,
  type UpdatePlan,
} from '../core/update';
import { applyDelta, upsertSongs } from '../db/updater';

const MANIFEST_KEY = 'hc.update.manifest';
const DEFAULT_MANIFEST_URL =
  'https://github.com/USER/holychords-offline/releases/latest/download/manifest.json';

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
        <h3 class="settings__subtitle">Обновление</h3>
        <label class="field">
          <span class="field__label">Адрес манифеста обновлений</span>
          <input class="search__input" id="manifest-url" type="url" inputmode="url" placeholder="https://github.com/…/releases/latest/download/manifest.json" />
        </label>
        <div class="settings__actions">
          <button class="button" id="check-update" type="button">Проверить обновления</button>
          <button class="button button--key" id="apply-update" type="button" disabled>Обновить</button>
        </div>
        <p class="settings__text" id="update-status">Готово к проверке</p>

        <div class="settings__actions">
          <button class="button" id="sync-site" type="button">Новые песни с сайта</button>
        </div>
        <p class="settings__text settings__text--muted" id="sync-status"></p>
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

  // ---------- обновление базы (M6) ----------
  const manifestInput = requireEl<HTMLInputElement>(root, '#manifest-url');
  const checkButton = requireEl<HTMLButtonElement>(root, '#check-update');
  const applyButton = requireEl<HTMLButtonElement>(root, '#apply-update');
  const updateStatus = requireEl<HTMLElement>(root, '#update-status');
  const syncButton = requireEl<HTMLButtonElement>(root, '#sync-site');
  const syncStatus = requireEl<HTMLElement>(root, '#sync-status');

  manifestInput.value = localStorage.getItem(MANIFEST_KEY) ?? DEFAULT_MANIFEST_URL;
  manifestInput.addEventListener('change', () => {
    localStorage.setItem(MANIFEST_KEY, manifestInput.value.trim());
  });

  let plan: UpdatePlan | null = null;

  const setStatus = (text: string): void => {
    updateStatus.textContent = text;
  };

  checkButton.addEventListener('click', () => {
    void (async () => {
      const url = manifestInput.value.trim();
      if (!url) {
        setStatus('Укажите адрес манифеста');
        return;
      }
      localStorage.setItem(MANIFEST_KEY, url);
      setStatus('Проверяю…');
      try {
        const manifest = await fetchManifest(url);
        const localVersion = (await context.repo.meta()).dataVersion;
        plan = planUpdate(localVersion, manifest);
        applyButton.disabled = plan.kind !== 'delta';
        setStatus(`${plan.message}. В базе: ${manifest.count.toLocaleString('ru-RU')} песен.`);
      } catch (error) {
        plan = null;
        applyButton.disabled = true;
        setStatus(`Не удалось проверить: ${errorMessage(error)}`);
      }
    })();
  });

  applyButton.addEventListener('click', () => {
    void (async () => {
      if (!plan || plan.kind !== 'delta' || !plan.asset) return;
      applyButton.disabled = true;
      setStatus('Скачиваю обновление…');
      try {
        const asset = plan.asset;
        const json = await downloadGzipJson(asset.url, asset.sha256);
        const pack = parseDeltaPack(json);
        setStatus(`Применяю: ${pack.songs.length} песен…`);
        const result = await applyDelta(pack);
        setStatus(`Готово: обновлено ${result.upserted}, удалено ${result.removed}, всего ${result.total}.`);
        context.meta = await context.repo.meta();
        plan = null;
      } catch (error) {
        applyButton.disabled = false;
        setStatus(`Ошибка обновления: ${errorMessage(error)}`);
      }
    })();
  });

  syncButton.addEventListener('click', () => {
    void (async () => {
      syncButton.disabled = true;
      syncStatus.textContent = 'Смотрю список новых песен на сайте…';
      try {
        const minId = await context.repo.maxId();
        const result = await fetchNewSongs({ minId, listPages: 2, maxSongs: 20 });
        if (result.songs.length === 0) {
          syncStatus.textContent = 'Новых песен не найдено';
          return;
        }
        syncStatus.textContent = `Нашёл ${result.newIds.length}, скачал ${result.songs.length}. Добавляю в базу…`;
        const applied = await upsertSongs(result.songs);
        syncStatus.textContent = `Добавлено песен: ${applied.upserted}, теперь в базе ${applied.total}.`;
        context.meta = await context.repo.meta();
      } catch (error) {
        syncStatus.textContent = `Не удалось обновить с сайта: ${errorMessage(error)}`;
      } finally {
        syncButton.disabled = false;
      }
    })();
  });

}

function requireEl<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент ${selector}`);
  return element;
}


async function fetchManifest(url: string): Promise<UpdateManifest> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseManifest(await response.json());
}

/** Скачивает .gz, проверяет sha256 (если указан) и распаковывает в JSON */
async function downloadGzipJson(url: string, expectedSha256: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = await response.arrayBuffer();
  if (expectedSha256) {
    const actual = await sha256Hex(buffer);
    if (actual !== expectedSha256) throw new Error('контрольная сумма не совпала');
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('устройство не поддерживает распаковку gzip');
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text) as unknown;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
