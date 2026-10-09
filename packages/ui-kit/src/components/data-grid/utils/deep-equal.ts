function isObject(value: unknown): value is Record<string, unknown> {
  return value === Object(value);
}

/**
 * Structural equality for plain data: same keys, same values, recursively. Not a general
 * comparator: it is used to decide whether a plugin's configuration props really changed, so it
 * does not look at prototypes, dates or cycles.
 */
export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return a === b;
  if (Object.keys(a).length !== Object.keys(b).length) return false;

  for (const key in a) {
    if (!(key in b) || !isDeepEqual(a[key], b[key])) return false;
  }
  return true;
}
