/**
 * Нормализация для поиска: нижний регистр, ё → е, схлопывание пробелов.
 * Одна и та же функция используется при сборке базы и в приложении при поиске,
 * иначе поиск «елка» не найдёт «Ёлка».
 */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Экранирование пользовательского запроса для FTS4 MATCH (последний токен — префиксный) */
export function toFtsQuery(rawQuery: string): string {
  const tokens = normalizeForSearch(rawQuery)
    .split(' ')
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((token) => token.length > 0)
    .slice(0, 8);

  if (tokens.length === 0) return '';

  return tokens
    .map((token, index) => (index === tokens.length - 1 ? `"${token}"*` : `"${token}"`))
    .join(' AND ');
}
