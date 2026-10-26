import {
  applyTheme,
  loadFavorites,
  loadSettings,
  saveSettings,
  type Settings,
} from '../app/settings';
import { getRepository } from '../db';
import type { DbMeta, SongRepository } from '../db/types';
import { renderHome } from './home';
import { renderSettings } from './settings';
import { renderSong } from './song';
import { renderSongForm } from './song-form';

export interface AppContext {
  repo: SongRepository;
  settings: Settings;
  meta: DbMeta | null;
  favorites: number[];
  onSelectSong: (id: number) => void;
  onBack: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onFavoritesChange: (ids: number[]) => void;
  /** Открыть форму добавления своей песни */
  onAddSong: () => void;
}

type View = 'home' | 'song' | 'settings';

export function layoutClass(width: number): 'compact' | 'medium' | 'expanded' {
  if (width >= 840) return 'expanded';
  if (width >= 600) return 'medium';
  return 'compact';
}

export async function mountApp(root: HTMLElement): Promise<void> {
  const settings = loadSettings();
  applyTheme(settings.theme);

  root.innerHTML = `
    <header class="app-bar">
      <div class="app-bar__title">
        <span class="app-bar__logo">HC</span>
        <span class="app-bar__name">Holychords Офлайн</span>
      </div>
      <div class="app-bar__actions">
        <span class="app-bar__badge" id="db-badge">база…</span>
        <button class="icon-button" id="open-settings" title="Настройки" aria-label="Настройки">⚙</button>
      </div>
    </header>
    <main class="app-main" id="main"></main>
  `;

  const main = root.querySelector<HTMLElement>('#main');
  const badge = root.querySelector<HTMLElement>('#db-badge');
  if (!main || !badge) throw new Error('Разметка оболочки не собралась');
  const mainEl: HTMLElement = main;

  const repo = await getRepository();
  let view: View = 'home';
  let formOpen = false;
  let favorites = safeFavorites();
  let meta: DbMeta | null = null;
  let currentSongId: number | null = null;

  const context: AppContext = {
    repo,
    settings,
    meta,
    favorites,
    onSelectSong: (id) => {
      currentSongId = id;
      view = 'song';
      paint();
    },
    onBack: () => {
      view = 'home';
      paint();
    },
    onOpenSettings: () => {
      view = 'settings';
      paint();
    },
    onCloseSettings: () => {
      view = 'home';
      paint();
    },
    onSettingsChange: (patch) => {
      Object.assign(settings, patch);
      saveSettings(settings);
      if (patch.theme) applyTheme(settings.theme);
      paint();
    },
    onFavoritesChange: (ids) => {
      favorites = ids;
      context.favorites = ids;
      paint();
    },
    onAddSong: () => {
      formOpen = true;
      paint();
    },
  };

  try {
    meta = await repo.meta();
    context.meta = meta;
    badge.textContent =
      meta.dataVersion === 'demo'
        ? 'демо-данные'
        : `${meta.count.toLocaleString('ru-RU')} песен · ${meta.dataVersion}`;
  } catch (error) {
    badge.textContent = 'база недоступна';
    badge.title = error instanceof Error ? error.message : String(error);
  }

  function paint(): void {
    const width = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const layout = layoutClass(width);
    document.body.dataset.layout = layout;

    const isCompact = layout === 'compact';
    const showList = isCompact ? view === 'home' : true;
    const showSong = isCompact ? view === 'song' && currentSongId !== null : currentSongId !== null;

    mainEl.innerHTML = `
      <section class="pane pane--list" ${showList ? '' : 'hidden'}><div class="slot" id="home-slot"></div></section>
      <section class="pane pane--song" ${showSong ? '' : 'hidden'}><div class="slot" id="song-slot"></div></section>
    `;

    if (showList) {
      const slot = mainEl.querySelector<HTMLElement>('#home-slot');
      if (slot) renderHome(slot, context);
    }

    if (showSong && currentSongId !== null) {
      const slot = mainEl.querySelector<HTMLElement>('#song-slot');
      if (slot) renderSong(slot, context, currentSongId, isCompact);
    }

    if (view === 'settings' || formOpen) {
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      const panel = document.createElement('div');
      panel.className = 'overlay__panel';
      overlay.append(panel);
      overlay.addEventListener('click', (event) => {
        if (event.target !== overlay) return;
        if (view === 'settings') context.onCloseSettings();
        else {
          formOpen = false;
          paint();
        }
      });
      document.body.append(overlay);

      if (view === 'settings') {
        renderSettings(panel, context);
      } else {
        renderSongForm(panel, {
          onCancel: () => {
            formOpen = false;
            paint();
          },
          onSave: async (input) => {
            const id = await repo.addSong(input);
            formOpen = false;
            currentSongId = id;
            view = 'song';
            paint();
          },
        });
      }
      requestAnimationFrame(() => overlay.classList.add('overlay--visible'));
    } else {
      document.querySelectorAll('.overlay').forEach((element) => element.remove());
    }
  }

  root.querySelector<HTMLButtonElement>('#open-settings')?.addEventListener('click', () => {
    context.onOpenSettings();
  });

  paint();

  let lastLayout = layoutClass(window.innerWidth);
  window.addEventListener('resize', () => {
    const next = layoutClass(window.innerWidth);
    if (next !== lastLayout) {
      lastLayout = next;
      paint();
    }
  });
}

function safeFavorites(): number[] {
  try {
    return loadFavorites();
  } catch {
    return [];
  }
}
