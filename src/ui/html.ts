/** Экранирование текста перед вставкой в HTML */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Текст песни с аккордами: пробелы и переводы строк обязаны сохраниться */
export function songTextHtml(text: string): string {
  return escapeHtml(text).replace(/ /g, '&nbsp;');
}
