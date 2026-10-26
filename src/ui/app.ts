import { Capacitor } from '@capacitor/core';

/**
 * Каркас M0: оболочка приложения и проверка окружения.
 * Экраны (Список/Поиск, Песня, Избранное, Настройки) появятся на этапе M4.
 */

interface EnvRow {
  label: string;
  value: string;
}

function platformRows(): EnvRow[] {
  const isNative = Capacitor.isNativePlatform();
  return [
    { label: 'Платформа', value: isNative ? Capacitor.getPlatform() : 'браузер (dev)' },
    { label: 'Офлайн-режим', value: 'да, сеть в рантайме не используется' },
    { label: 'База', value: 'не собрана (этап M2)' },
    { label: 'Версия сборки', value: __APP_VERSION__ },
  ];
}

function layoutClass(): string {
  const width = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
  if (width >= 840) return 'layout-expanded';
  if (width >= 600) return 'layout-medium';
  return 'layout-compact';
}

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="app-bar">
      <div class="app-bar__title">
        <span class="app-bar__logo">HC</span>
        <span>Holychords Офлайн</span>
      </div>
      <span class="app-bar__badge">M0 · каркас</span>
    </header>
    <main class="app-main">
      <section class="card">
        <h1 class="card__title">Каркас готов</h1>
        <p class="card__text">
          Приложение работает офлайн. Дальше по плану: сбор базы песен (M1–M2),
          движок транспонирования (M3), экраны (M4), APK (M5), обновления (M6).
        </p>
        <dl class="env">
          ${platformRows()
            .map(
              (row) => `
            <div class="env__row">
              <dt class="env__label">${row.label}</dt>
              <dd class="env__value">${row.value}</dd>
            </div>`,
            )
            .join('')}
        </dl>
      </section>

      <section class="card card--muted">
        <h2 class="card__subtitle">Экраны в разработке</h2>
        <ul class="screen-list">
          <li class="screen-list__item">Поиск и список песен</li>
          <li class="screen-list__item">Песня: аккорды, тональность, капо, автоскролл</li>
          <li class="screen-list__item">Избранное и сет-листы</li>
          <li class="screen-list__item">Настройки и обновление базы</li>
        </ul>
      </section>
    </main>
    <footer class="app-footer">
      <span id="viewport-info" class="app-footer__text"></span>
    </footer>
  `;

  const viewportInfo = root.querySelector<HTMLElement>('#viewport-info');
  const render = (): void => {
    document.body.dataset.layout = layoutClass();
    if (viewportInfo) {
      viewportInfo.textContent = `Окно ${window.innerWidth}×${window.innerHeight}px · ${widthBucketLabel()}`;
    }
  };

  render();
  window.addEventListener('resize', render);
  window.addEventListener('orientationchange', render);
}

function widthBucketLabel(): string {
  const bucket = document.body.dataset.layout;
  if (bucket === 'layout-expanded') return 'планшет / широкий экран';
  if (bucket === 'layout-medium') return 'планшет 7–8"';
  return 'телефон';
}
