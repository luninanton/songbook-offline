// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../app';
import { DEFAULT_SETTINGS } from '../../app/settings';

/**
 * Smoke-тест интерфейса: монтируем приложение на демо-данных и проверяем,
 * что список, экран песни и транспонирование работают (без реальной базы).
 */
async function mount(overrides: Record<string, unknown> = {}): Promise<HTMLElement> {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  localStorage.setItem('hc.settings.v1', JSON.stringify({ ...DEFAULT_SETTINGS, ...overrides }));
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

describe('ui: фильтр и свои песни', () => {
  it('фильтр «Только с аккордами» убирает песни без аккордов', async () => {
    const root = await mount();
    expect(root.querySelectorAll('.song-row').length).toBe(5);

    const chip = root.querySelector<HTMLButtonElement>('#chords-filter') as HTMLButtonElement;
    chip.click();
    await new Promise((done) => setTimeout(done, 60));

    expect(chip.classList.contains('chip--active')).toBe(true);
    expect(root.querySelectorAll('.song-row').length).toBe(4);
  });

  it('добавляет свою песню через форму и открывает её', async () => {
    const root = await mount();

    (root.querySelector('#add-song') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    const title = document.querySelector<HTMLInputElement>('#title') as HTMLInputElement;
    const text = document.querySelector<HTMLTextAreaElement>('#text') as HTMLTextAreaElement;
    expect(title).not.toBeNull();

    title.value = 'Своя тестовая';
    text.value = 'Am   C\nстрока раз\nF    G\nстрока два';

    (document.querySelector('#save') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 80));

    const songTitle = root.querySelector('#song-title')?.textContent ?? '';
    expect(songTitle).toBe('Своя тестовая');

    // аккорды подсвечены и транспонирование доступно
    expect(root.querySelectorAll('#song-text .chord').length).toBeGreaterThan(0);
    (root.querySelector('#transpose-up') as HTMLButtonElement).click();
    expect(root.querySelector('#song-text')?.textContent).toContain('A#');
  });
});

describe('ui: редактирование своей песни', () => {
  it('открывает форму с заполненными полями и сохраняет изменения без дубля', async () => {
    const root = await mount();

    // создаём песню
    (root.querySelector('#add-song') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    (document.querySelector<HTMLInputElement>('#title') as HTMLInputElement).value = 'Черновик';
    (document.querySelector<HTMLTextAreaElement>('#text') as HTMLTextAreaElement).value =
      'Am  C\nстрока раз';
    (document.querySelector('#save') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 80));

    expect(root.querySelector('#song-title')?.textContent).toBe('Черновик');

    // редактируем
    (root.querySelector('#edit-song') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    const title = document.querySelector<HTMLInputElement>('#title') as HTMLInputElement;
    const text = document.querySelector<HTMLTextAreaElement>('#text') as HTMLTextAreaElement;
    expect(title.value).toBe('Черновик');
    expect(text.value).toContain('Am  C');
    expect(document.querySelector('.settings__title')?.textContent).toContain('Редактировать');

    title.value = 'Переименованная';
    text.value = 'Dm  Bb\nстрока новая';
    (document.querySelector('#save') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 80));

    expect(root.querySelector('#song-title')?.textContent).toBe('Переименованная');

    // поиск находит ровно одну запись со старым id — дубля нет
    const input = root.querySelector<HTMLInputElement>('#search-input') as HTMLInputElement;
    input.value = 'Переименованная';
    input.dispatchEvent(new Event('input'));
    await new Promise((done) => setTimeout(done, 260));

    expect(root.querySelectorAll('.song-row').length).toBe(1);
  });
});

describe('ui: подсказки в форме своей песни', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('подставляет тональность по первому аккорду', async () => {
    const root = await mount();
    (root.querySelector('#add-song') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    const text = document.querySelector<HTMLTextAreaElement>('#text') as HTMLTextAreaElement;
    text.value = 'Dm      Bb' + '\n' + 'строка раз';
    text.dispatchEvent(new Event('input'));

    expect((document.querySelector('#key') as HTMLSelectElement).value).toBe('Dm');
    expect(document.querySelector('#form-status')?.textContent).toContain('Dm');
  });

  it('не перебивает тональность, выбранную вручную', async () => {
    const root = await mount();
    (root.querySelector('#add-song') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    const keySelect = document.querySelector('#key') as HTMLSelectElement;
    keySelect.value = 'G';
    keySelect.dispatchEvent(new Event('change'));

    const text = document.querySelector<HTMLTextAreaElement>('#text') as HTMLTextAreaElement;
    text.value = 'Am   C' + '\n' + 'строка';
    text.dispatchEvent(new Event('input'));

    expect(keySelect.value).toBe('G');
  });

  it('нормализует табы и лишние пустые строки', async () => {
    const root = await mount();
    (root.querySelector('#add-song') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 30));

    const text = document.querySelector<HTMLTextAreaElement>('#text') as HTMLTextAreaElement;
    text.value = 'Am\t\tC\n\n\n\nстрока   \n\n';
    (document.querySelector('#normalize') as HTMLButtonElement).click();

    expect(text.value).toBe('Am        C\n\nстрока');
  });

  it('предупреждает о дубле и не сохраняет при отказе', async () => {
    const root = await mount();

    const addSong = async (title: string): Promise<void> => {
      (root.querySelector('#add-song') as HTMLButtonElement).click();
      await new Promise((done) => setTimeout(done, 30));
      (document.querySelector('#title') as HTMLInputElement).value = title;
      (document.querySelector('#text') as HTMLTextAreaElement).value = 'Am  C' + '\n' + 'строка';
      (document.querySelector('#save') as HTMLButtonElement).click();
      await new Promise((done) => setTimeout(done, 60));
    };

    await addSong('Дубль тест');
    const rowsBefore = document.querySelectorAll('.song-row').length;

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await addSong('Дубль тест');

    expect(confirmSpy).toHaveBeenCalled();
    expect(document.querySelector('#form-status')?.textContent).toContain('уже есть');
    expect(document.querySelectorAll('.song-row').length).toBe(rowsBefore);
  });
});


describe('ui: диаграмма аккорда', () => {
  it('открывает аппликатуру по тапу на аккорд и закрывается', async () => {
    const root = await mount();
    (root.querySelector('.song-row') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 40));

    const chord = root.querySelector('#song-text .chord') as HTMLElement | null;
    expect(chord).not.toBeNull();
    chord?.click();

    const sheet = document.querySelector('.chord-sheet');
    expect(sheet).not.toBeNull();
    expect((sheet?.querySelector('.chord-sheet__title')?.textContent ?? '').length).toBeGreaterThan(0);
    expect(sheet?.querySelector('svg.chord-sheet__svg')).not.toBeNull();

    (document.querySelector('#close-chord') as HTMLButtonElement).click();
    expect(document.querySelector('.chord-sheet')).toBeNull();
  });
});

describe('ui: сворачивание списка на планшете', () => {
  it('кнопка ☰ убирает список, показывает подсказку и запоминает состояние', async () => {
    const root = await mount();

    const toggle = root.querySelector<HTMLButtonElement>('#toggle-list') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.hidden).toBe(false);

    expect(root.querySelectorAll('.song-row').length).toBeGreaterThan(0);
    expect(root.querySelector('.splitter')).not.toBeNull();

    toggle.click();
    await new Promise((done) => setTimeout(done, 60));

    // список и разделитель убраны из разметки, справа — подсказка
    expect(root.querySelector('.pane--list')).toBeNull();
    expect(root.querySelector('.splitter')).toBeNull();
    expect(root.querySelector('#song-slot')?.textContent).toContain('Список свёрнут');
    expect(JSON.parse(localStorage.getItem('hc.settings.v1') ?? '{}').listCollapsed).toBe(true);

    // возвращаем список обратно
    (root.querySelector('#toggle-list') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 60));
    expect(root.querySelectorAll('.song-row').length).toBeGreaterThan(0);
    expect(root.querySelector('.splitter')).not.toBeNull();
  });

describe('ui: пианино и звук в окне аккорда', () => {
  async function openChord(overrides: Record<string, unknown> = {}): Promise<HTMLElement> {
    const root = await mount(overrides);
    (root.querySelector('.song-row') as HTMLButtonElement).click();
    await new Promise((done) => setTimeout(done, 40));
    (root.querySelector('#song-text .chord') as HTMLElement).click();
    await new Promise((done) => setTimeout(done, 30));
    return root;
  }

  it('по умолчанию показывает и гитару, и пианино', async () => {
    await openChord();

    expect(document.querySelector('.chord-sheet__body svg.chord-sheet__svg')).not.toBeNull();
    expect(document.querySelector('svg.chord-sheet__svg--piano')).not.toBeNull();
    expect(document.querySelectorAll('.chord-sheet__section').length).toBe(2);
    expect(document.body.textContent).toContain('Пианино');
  });

  it('в режиме «только пианино» открывает вкладку с клавишами', async () => {
    await openChord({ instrument: 'piano' });

    const piano = document.querySelector('svg.chord-sheet__svg--piano');
    expect(piano).not.toBeNull();
    // клавиши нарисованы: 15 белых + чёрные
    expect((piano?.querySelectorAll('rect').length ?? 0)).toBeGreaterThan(15);

    const activeTab = document.querySelector('.tab--active');
    expect(activeTab?.textContent).toContain('Пианино');

    // переключаемся на гитару
    (document.querySelector('[data-tab="guitar"]') as HTMLButtonElement).click();
    expect(document.querySelector('svg.chord-sheet__svg--piano')).toBeNull();
    expect(document.querySelector('#chord-body svg')).not.toBeNull();
  });

  it('без WebAudio кнопка звука скрыта и ничего не падает', async () => {
    await openChord();
    const play = document.querySelector<HTMLButtonElement>('#play-chord');
    expect(play).not.toBeNull();
    // в jsdom AudioContext отсутствует — кнопка должна быть скрыта
    expect(play?.hidden).toBe(true);
  });
});

});
