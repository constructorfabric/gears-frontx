// Search-string decode/parse/build — the one codec this package uses for
// TanStack's own `?a=b&c=d`-shaped search string, kept in its own module so
// no second caller can carry a near-verbatim copy of the parse without the
// malformed-input guard below. `virtual-location.ts`'s own history-adaptation
// codec imports from here.
//
// Not the navigation substrate's own grammar codec — that codec encodes the
// composed-application URL's entry syntax (ADR 0003), a structurally
// different grammar from TanStack's own query-string surface, which every
// caller of this module treats as opaque and never re-parses beyond generic
// `name=value` splitting (FEATURE (engine-provider) §3, step 1: "this
// package's own adapter treats as an opaque string").
//
// Internal to this package: no caller outside `packages/routing-tanstack`
// needs a search string in this shape directly, so none of this module's
// exports appear on `src/index.ts` (DESIGN §3.3, API Contracts).
import type { Param } from '@gears-frontx/routing';

/**
 * `decodeURIComponent` throws `URIError` on a bare `%` or any other
 * malformed percent-escape — a real possibility for a page's own query
 * string, which this adapter never controls (a hand-typed URL, a bookmark
 * from an older version of the app, a third party's own link). Letting that
 * throw escape a caller here would fail the whole adaptation at
 * construction over one bad pair; falling back to the raw, still-encoded
 * text for that one pair keeps every other pair intact and keeps
 * construction total, mirroring the navigation substrate's own grammar
 * parse, which never throws on a malformed token either — it downgrades to
 * a warning instead (`ParseWarningCode`, 'malformed-entry'). This adapter
 * has no warning channel of its own to report through, so it keeps the raw
 * text rather than dropping the pair outright: a raw, still-percent-encoded
 * value is still a usable (if unlovely) string for whatever reads it next,
 * where dropping it would silently lose a parameter the URL visibly still
 * carries.
 *
 * The raw text does not stay raw indefinitely: `buildSearchString` runs
 * every value through `encodeURIComponent` on the next write regardless of
 * where it came from, so a value kept raw here because it failed to decode
 * is re-encoded on that write like any other — a bare `%` becomes `%25`,
 * for instance. The URL's own text changes without this adapter raising a
 * signal of its own (DESIGN §3.3, "Virtual location").
 */
export function decodeComponentOrRaw(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Decodes one search name or value as form data: a `+` reads as a space,
 * then {@link decodeComponentOrRaw} decodes the percent-escapes. TanStack's
 * own search serializer builds the string with `URLSearchParams`, which
 * writes a space as `+`; `decodeURIComponent` alone leaves that `+` in
 * place. A literal plus arrives as `%2B` from both writers, TanStack's and
 * {@link buildSearchString}, so it still reads back as `+`. A malformed
 * text keeps its percent-escapes raw, its `+` still read as a space, as
 * `URLSearchParams` itself reads it. */
function decodeSearchComponent(text: string): string {
  return decodeComponentOrRaw(text.replace(/\+/g, ' '));
}

/** Splits a `?a=b&c=d`-shaped (or bare `a=b&c=d`) search string into
 * name/value pairs, decoding each with {@link decodeSearchComponent} so a
 * `+` reads as a space and a malformed pair falls back to its raw text
 * instead of throwing. Every caller in this package that needs a search
 * string parsed into pairs goes through this one function rather than
 * splitting and decoding on its own. */
export function parseSearchString(search: string): readonly Param[] {
  const trimmed = search.startsWith('?') ? search.slice(1) : search;
  if (trimmed === '') {
    return [];
  }
  return trimmed.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      return { name: decodeSearchComponent(pair), value: '' };
    }
    return { name: decodeSearchComponent(pair.slice(0, eq)), value: decodeSearchComponent(pair.slice(eq + 1)) };
  });
}

/** The reverse of {@link parseSearchString}: builds a `?a=b&c=d`-shaped
 * search string from name/value pairs, encoding each with
 * `encodeURIComponent` — including a value {@link decodeComponentOrRaw} once
 * kept raw because it failed to decode, which this re-encodes like any
 * other value on this next write. */
export function buildSearchString(params: readonly Param[]): string {
  if (params.length === 0) {
    return '';
  }
  return `?${params.map((param) => `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`).join('&')}`;
}
