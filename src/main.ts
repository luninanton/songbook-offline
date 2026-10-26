import './styles/main.css';
import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Не найден контейнер #app');
}

mountApp(root);
