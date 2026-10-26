import type { SongQuery } from '../db/types';
import type { AppContext } from './app';
import { escapeHtml } from './html';

type Sort = NonNullable<SongQuery['sort']> | 'favorites';

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'new', label: 'Новые' },
  { id: 'popular', label: 'Популярные' },
  { id: 'title', label: 'По алфавиту' },
  { id: 'favorites', label: 'Избранное' },
];

const PAGE_SIZE = 60;

/** Экран поиска и списка песен */
export function renderHome(root: HTMLElement, context: AppContext): void {
  root.innerHTML = `
    <div class="search">
      <input
        class="search__input"
        id="search-input"
        type="search"
        inputmode="search"
        placeholder="Поиск по названию, исполнителю или словам"
        autocomplete="off"
        enterkeyhint="search"
      />
      <div class="segmented" id="sort-tabs">
        ${SORTS.map(
          (sort) =>
            `<button class="segmented__button" data-sort="${sort.id}">${sort.label}</button>`,
        ).join('')}
      </div>
    </div>
    <div class="list" id="song-list" aria-live="polite"></div>
    <div class="list__footer" id="list-footer"></div>
  `;

  const input = root.querySelector<HTMLInputElement>('#search-input');
  const tabs = root.querySelector<HTMLElement>('#sort-tabs');
  const list = root.querySelector<HTMLElement>('#song-list');
  const footer = root.querySelector<HTMLElement>('#list-footer');
  if (!input || !tabs || !list || !footer) return;

  let sort: Sort = 'new';
  let offset = 0;
  let total = 0;
  let loading = false;
  let query = '';

  const highlightSort = (): void => {
    tabs.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((button) => {
      button.classList.toggle('segmented__button--active', button.dataset.sort === sort);
    });
  };

  const load = async (reset: boolean): Promise<void> => {
    if (loading) return;
    loading = true;
    if (reset) {
      offset = 0;
      list.innerHTML = '<div class="list__empty">Загрузка…</div>';
    }

    try {
      const page = await context.repo.search({
        query,
        sort: sort === 'favorites' ? 'title' : sort,
        favoritesOnly: sort === 'favorites',
        favorites: context.favorites,
        limit: PAGE_SIZE,
        offset,
      });

      total = page.total;
      if (reset) list.innerHTML = '';

      if (page.items.length === 0 && reset) {
        list.innerHTML =
          sort === 'favorites'
            ? '<div class="list__empty">В избранном пока пусто</div>'
            : '<div class="list__empty">Ничего не найдено</div>';
      }

      for (const song of page.items) {
        const button = document.createElement('button');
        button.className = 'song-row';
        button.type = 'button';
        button.dataset.id = String(song.id);
        button.innerHTML = `
          <span class="song-row__main">
            <span class="song-row__title">${escapeHtml(song.title)}</span>
            <span class="song-row__artist">${escapeHtml(song.artist)}${song.album ? ' · ' + escapeHtml(song.album) : ''}</span>
          </span>
          <span class="song-row__key">${song.key ? escapeHtml(song.key) : '—'}</span>
        `;
        button.addEventListener('click', () => context.onSelectSong(song.id));
        list.append(button);
      }

      offset += page.items.length;
      footer.textContent =
        offset >= total
          ? `Всего: ${total.toLocaleString('ru-RU')}`
          : `Показано ${offset.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}`;

      if (offset < total) {
        const more = document.createElement('button');
        more.className = 'button button--ghost';
        more.type = 'button';
        more.textContent = 'Показать ещё';
        more.addEventListener('click', () => {
          more.remove();
          void load(false);
        });
        footer.append(' ');
        footer.append(more);
      }
    } catch (error) {
      list.innerHTML = `<div class="list__empty">Ошибка базы: ${escapeHtml(
        error instanceof Error ? error.message : String(error),
      )}</div>`;
    } finally {
      loading = false;
    }
  };

  let searchTimer: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = input.value;
      void load(true);
    }, 200);
  });

  tabs.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-sort]');
    if (!target?.dataset.sort) return;
    sort = target.dataset.sort as Sort;
    highlightSort();
    void load(true);
  });

  highlightSort();
  void load(true);
}
