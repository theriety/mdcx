/**
 * normalizes semantic AST data for round-trip law assertions
 * @param value AST value to normalize
 * @returns range-free semantic data with optional empty structures collapsed
 */
export function normalizeAst(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeAst);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => key !== 'range' && item !== undefined)
      .map(([key, item]) => [key, normalizeAst(item)])
      .filter(([key, item]) => {
        if (key === 'annotations') {
          return Object.keys(item as object).length > 0;
        }

        return !(
          ['children', 'content', 'formats'].includes(String(key)) &&
          Array.isArray(item) &&
          item.length === 0
        );
      }),
  );

  return normalized;
}
