import './styles/main.css';
import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Не найден контейнер #app');
}

void mountApp(root).catch((error: unknown) => {
  root.innerHTML = `<div class="list__empty">Не удалось запустить приложение: ${
    error instanceof Error ? error.message : String(error)
  }</div>`;
});
