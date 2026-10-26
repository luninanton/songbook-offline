import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pro.holychords.offline',
  appName: 'Holychords Офлайн',
  webDir: 'dist',
  android: {
    // Приложение должно работать без сети; доступ к сайту нужен только
    // для явного действия «Обновить базу» (этап M6).
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // Запросы к holychords.pro и GitHub идут через нативный HTTP:
    // у сайта нет CORS-заголовков, обычный fetch из WebView был бы заблокирован.
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
