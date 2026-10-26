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
  return buildQuery(rawQuery, 'AND') ?? '';
}

/**
 * Набор запросов для поиска, от строгого к мягкому.
 *
 * 1. Все слова через AND, каждое слово ищется в двух вариантах — с «ё» и с «е».
 *    Без этого поиск «все» не находил «всё» (в индексе лежит исходное написание).
 * 2. Если строгий вариант ничего не дал — те же слова через OR: так находятся
 *    песни, где совпала только часть фразы.
 */
export function buildFtsQueries(rawQuery: string): string[] {
  const strict = buildQuery(rawQuery, 'AND');
  if (!strict) return [];

  const relaxed = buildQuery(rawQuery, 'OR');
  return relaxed && relaxed !== strict ? [strict, relaxed] : [strict];
}

function buildQuery(rawQuery: string, joiner: 'AND' | 'OR'): string | null {
  const tokens = normalizeForSearch(rawQuery)
    .split(' ')
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((token) => token.length > 0)
    .slice(0, 8);

  if (tokens.length === 0) return null;

  const groups = tokens.map((token, index) => {
    const prefix = index === tokens.length - 1 ? '*' : '';
    const variants = new Set<string>([token]);
    if (token.includes('е')) variants.add(token.replace(/е/g, 'ё'));
    const parts = [...variants].map((variant) => `"${variant}"${prefix}`);
    return parts.length > 1 ? `(${parts.join(' OR ')})` : (parts[0] as string);
  });

  return groups.join(` ${joiner} `);
}
