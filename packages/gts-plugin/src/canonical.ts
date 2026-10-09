/**
 * Canonical form of content
 *
 * Decides whether two definitions or instances are "the same content". The
 * GTS library treats `gts://X` and `X` as one identifier, so a naive
 * structural comparison would call a re-registration a conflict only because
 * two copies spell an identifier differently.
 *
 * @packageDocumentation
 */

// @cpt-algo:cpt-frontx-algo-gts-type-provider-canonical-form:p1

/** Leading `gts://` of an identifier; the GTS library treats `gts://X` and `X` as one. */
export const GTS_URI_PREFIX = 'gts://';

/** Keys whose string value is a GTS identifier, so `gts://X` and `X` are one value. */
const IDENTIFIER_KEYS = new Set(['$id', '$$id', '$ref', '$$ref', 'x-gts-ref']);

type Canonical = { ok: true; value: unknown } | { ok: false; reason: string };

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function canonicalizeArray(items: unknown[], path: Set<object>): Canonical {
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-array
  const out: unknown[] = [];
  for (let i = 0; i < items.length; i++) {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-unrepresentable
    if (!(i in items)) return { ok: false, reason: 'a hole in a sparse array' };
    // @cpt-end:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-unrepresentable
    const item = canonicalize(items[i], path);
    if (!item.ok) return item;
    out.push(item.value);
  }
  return { ok: true, value: out };
  // @cpt-end:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-array
}

function canonicalizeObject(obj: Record<string, unknown>, path: Set<object>): Canonical {
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-object
  // No prototype: with `{}`, assigning a `__proto__` key would set the
  // prototype instead of a property, and two contents differing only there
  // would share one canonical text.
  const out: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(obj).sort()) {
    const raw = obj[key];
    // A property that is undefined is absent in JSON.
    if (raw === undefined) continue;
    const item = canonicalize(raw, path);
    if (!item.ok) return item;
    out[key] =
      IDENTIFIER_KEYS.has(key) && typeof item.value === 'string' && item.value.startsWith(GTS_URI_PREFIX)
        ? item.value.slice(GTS_URI_PREFIX.length)
        : item.value;
  }
  return { ok: true, value: out };
  // @cpt-end:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-object
}

function canonicalize(value: unknown, path: Set<object>): Canonical {
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-scalar
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
  // @cpt-end:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-scalar

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-unrepresentable
  if (typeof value !== 'object') {
    return { ok: false, reason: typeof value === 'number' ? `a non-finite number (${value})` : typeof value };
  }
  if (path.has(value)) return { ok: false, reason: 'a cycle' };
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return { ok: false, reason: 'an object that is neither a plain object nor an array' };
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-unrepresentable

  // The path holds the objects being descended through, so only a value
  // reached again along its own path is a cycle; a shared subtree is not.
  path.add(value);
  try {
    return Array.isArray(value) ? canonicalizeArray(value, path) : canonicalizeObject(value, path);
  } finally {
    path.delete(value);
  }
}

/** Serialize content in canonical form, or report why it cannot be a JSON value. */
// @cpt-begin:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-return
export function canonicalText(
  content: unknown
): { ok: true; text: string } | { ok: false; reason: string } {
  const result = canonicalize(content, new Set());
  return result.ok ? { ok: true, text: JSON.stringify(result.value) } : result;
}

/** Two contents are the same when both are representable and serialize alike. */
export function sameContent(a: unknown, b: unknown): boolean {
  const left = canonicalText(a);
  if (!left.ok) return false;
  const right = canonicalText(b);
  return right.ok && left.text === right.text;
}
// @cpt-end:cpt-frontx-algo-gts-type-provider-canonical-form:p1:inst-cf-return

/**
 * Deep copy of content already known to be representable, so a later change
 * to the caller's object never reaches a stored definition.
 */
export function deepCopyJson<T>(content: T): T {
  // JSON.parse yields untyped data; T is the same plain-JSON shape by the
  // caller's precondition (content passed canonicalText first).
  return JSON.parse(JSON.stringify(content)) as T;
}

/**
 * 53-bit cyrb53 hash as lowercase hex. Part of store format 1: changing it
 * changes every key, so it needs a format bump.
 */
export function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
