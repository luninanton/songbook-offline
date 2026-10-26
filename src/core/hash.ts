/**
 * Портативный хэш для сравнения версий песни (дельта-обновления).
 * FNV-1a 64 бита: детерминированный, работает и в Node, и в WebView,
 * без зависимостей от node:crypto и Web Crypto API.
 */
export function hashText(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const prime = 1099511628211n;
  let hash = 14695981039346656037n;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash.toString(16).padStart(16, '0');
}
