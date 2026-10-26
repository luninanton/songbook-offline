// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountApp } from '../app';
import { DEFAULT_SETTINGS } from '../../app/settings';

/**
 * Smoke-тест интерфейса: монтируем приложение на демо-данных и проверяем,
 * что список, экран песни и транспонирование работают (без реальной базы).
 */
async function mount(): Promise<HTMLElement> {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  Object.assign(localStorage, {});
  const root = document.getElementById('app') as HTMLElement;
  await mountApp(root);
  // даём отработать асинхронной загрузке списка
  await new Promise((done) => setTimeout(done, 30));
  return root;
}

describe('ui: экран списка', () => {
  beforeEach(() => {
    localStorage.setItem('hc.settings.v1', JSON.stringify(DEFAULT_SETTINGS));
  });

  it('показывает список песен из демо-базы', async () => {
    const root = await mount();
    const rows = root.querySelectorAll('.song-row');
    expect(rows.length).toBe(5);
    expect(root.querySelector('.app-bar__badge')?.textContent).toContain('демо');
  });

  it('ищет по тексту и по исполнителю', async () => {
    const root = await mount();
    const input = root.querySelector<HTMLInputElement>('#search-input') as HTMLInputElement;
    input.value = 'второй';
    input.dispatchEvent(new Event('input'));
    await new Promise((done) => setTimeout(done, 260));

    const rows = root.querySelectorAll('.song-row');
    expect(rows.length).toBe(2);
  });

  it('открывает песню и транспонирует аккорды', async () => {
    const root = await mount();
    (root.querySelector('.song-row') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    const text = root.querySelector<HTMLElement>('#song-text');
    expect(text).not.toBeNull();
    expect(text?.textContent).toContain('G');
    const before = text?.textContent ?? '';

    (root.querySelector('#transpose-up') as HTMLButtonElement).click();
    const after = root.querySelector<HTMLElement>('#song-text')?.textContent ?? '';

    expect(after).not.toBe(before);
    expect(root.querySelector('#key-label')?.textContent).toBe('Ab');
  });

  it('переключает показ аккордов', async () => {
    const root = await mount();
    (root.querySelector('.song-row') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    const toggle = root.querySelector('#toggle-chords') as HTMLButtonElement;
    toggle.click();
    const withoutChords = root.querySelector<HTMLElement>('#song-text')?.textContent ?? '';
    expect(withoutChords).not.toContain('G ');
  });

  it('открывает настройки и показывает сведения о базе', async () => {
    const root = await mount();
    (root.querySelector('#open-settings') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 20));

    const overlay = document.querySelector('.overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Настройки');
    expect(document.querySelector('#db-info')?.textContent).toContain('5');
  });

  it('добавляет песню в избранное и показывает фильтр', async () => {
    const root = await mount();
    (root.querySelector('.song-row') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    (root.querySelector('#favorite') as HTMLButtonElement).click();
    // после клика панель перерисовывается и песня загружается заново
    await new Promise((done) => setTimeout(done, 40));

    expect(root.querySelector('#favorite')?.textContent).toBe('★');
    expect(JSON.parse(localStorage.getItem('hc.favorites.v1') ?? '[]')).toEqual([1]);
  });
});
