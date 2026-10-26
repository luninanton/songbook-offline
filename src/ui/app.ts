import {
  applyTheme,
  loadFavorites,
  loadSettings,
  saveSettings,
  type Settings,
} from '../app/settings';
import { getRepository } from '../db';
import type { DbMeta, SongFull, SongRepository } from '../db/types';
import { renderHome } from './home';
import { renderSettings } from './settings';
import { renderSong } from './song';
import { renderSongForm } from './song-form';
import { loadUserSongs, upsertUserSong } from '../app/user-songs';
import { hasChords } from '../core/chords';
import { hashText } from '../core/hash';
import type { Song } from '../core/types';

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
  /** Открыть форму редактирования своей песни */
  onEditSong: (song: SongFull) => void;
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
  let formSong: SongFull | null = null;
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
      formSong = null;
      formOpen = true;
      paint();
    },
    onEditSong: (song) => {
      formSong = song;
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

  // Свои песни хранятся в localStorage: после переустановки базы досылаем их обратно
  for (const song of loadUserSongs()) {
    try {
      await repo.saveUserSong(song);
    } catch {
      // база может быть ещё не готова — песня останется в localStorage
    }
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
          initial: formSong
            ? {
                title: formSong.title,
                artist: formSong.artist === 'Своя песня' ? '' : formSong.artist,
                key: formSong.key,
                text: formSong.text,
              }
            : undefined,
          onCancel: () => {
            formOpen = false;
            formSong = null;
            paint();
          },
          onSave: async (input) => {
            const text = input.text.replace(/\r\n?/g, '\n').trimEnd();
            const song: Song = {
              id: formSong?.id ?? Date.now(),
              origin: 'user',
              title: input.title.trim() || 'Без названия',
              artist: input.artist.trim() || 'Своя песня',
              artistId: null,
              album: null,
              albumId: null,
              key: input.key.trim(),
              text,
              hasChords: hasChords(text),
              lang: 'ru',
              publishedAt: null,
              modifiedAt: new Date().toISOString(),
              hash: hashText(`${input.key}\n${text}`),
            };
            await repo.saveUserSong(song);
            upsertUserSong(song);
            formOpen = false;
            formSong = null;
            currentSongId = song.id;
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
