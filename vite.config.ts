import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };

export default defineConfig({
  // Относительные пути нужны, чтобы приложение работало из WebView (https://localhost)
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    // es2020 нужен из-за BigInt (хэш версий песен). Android System WebView
    // обновляется через Play Store, поэтому на Android 6+ актуальная версия движка.
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
