import { describe, expect, it } from 'vitest';
import { parseGrammar } from '../../grammar/parse.js';
import { serializeGrammar } from '../../grammar/serialize.js';
import { entry, expectRoutingError } from '../helpers.js';
import type { SerializeInput } from '../../types/index.js';

// cpt-frontx-algo-routing-navigation-substrate-grammar-serialize
// FEATURE §6 Acceptance Criteria — round-trip property, examples 7.1/7.6/7.8.

describe('serializeGrammar — round-trip (parse -> serialize is byte-exact for canonical input)', () => {
  it('reproduces example 7.1 exactly', () => {
    const url =
      '/en?screen=dashboard;orientation=left' +
      '&sheet=tenant-details;tenantId=456' +
      '&sheet=user-contacts;contactId=123;view=active' +
      '&widgets=line-a;range=7d' +
      '&widgets=line-b;range=30d' +
      '&widgets=pie;metric=revenue';
    const parsed = parseGrammar(url);
    expect(serializeGrammar(parsed)).toBe(url);
  });

  it('reproduces example 7.6 (escaping) exactly, byte for byte', () => {
    const url = '/en?sheet=search;q=a%26b%3Dc%20d';
    const parsed = parseGrammar(url);
    expect(serializeGrammar(parsed)).toBe(url);
  });

  it('reproduces example 7.8 (zero entries) as the bare shell subroute, no trailing "?"', () => {
    const parsed = parseGrammar('/en');
    expect(serializeGrammar(parsed)).toBe('/en');
  });

  it('normalizes an explicit "k=" empty value to the canonical bare form on re-serialize', () => {
    const parsed = parseGrammar('/en?sheet=tenant-details;k=');
    expect(serializeGrammar(parsed)).toBe('/en?sheet=tenant-details;k');
  });

  it('accepts a param with a non-empty name and an empty value — legal, unlike an empty name', () => {
    // `param-value = *( pchar-safe | pct-encoded )` (ADR 0003, "Tokens") is
    // zero-or-more, unlike `param-name`'s own one-or-more — a bare name
    // with no `=` is already the canonical, complete encoding of this.
    const input: SerializeInput = {
      shellSubroute: '/en',
      hash: undefined,
      entries: [entry('sheet', 'tenant-details', [{ name: 'k', value: '' }])],
      foreignSegments: [],
    };
    expect(serializeGrammar(input)).toBe('/en?sheet=tenant-details;k');
  });

  it('preserves the hash across a round-trip', () => {
    const parsed = parseGrammar('/en?screen=dashboard#x');
    expect(serializeGrammar(parsed)).toBe('/en?screen=dashboard#x');
  });

  // Direct on serializeGrammar, not routed through parseGrammar: parse
  // normalizes a present-but-empty hash to `undefined` before it ever
  // reaches serialize (see parse.ts), so a round-trip test alone cannot
  // prove serialize's own guard holds against a caller that constructs
  // `{ hash: '' }` directly instead of getting it from parse.
  it('treats an explicit empty-string hash as absent — no bare trailing "#"', () => {
    const input: SerializeInput = { shellSubroute: '/en', hash: '', entries: [], foreignSegments: [] };
    expect(serializeGrammar(input)).toBe('/en');
  });

  it('treats an explicit empty-string hash as absent alongside entries — no bare trailing "#"', () => {
    const input: SerializeInput = {
      shellSubroute: '/en',
      hash: '',
      entries: [entry('screen', 'dashboard')],
      foreignSegments: [],
    };
    expect(serializeGrammar(input)).toBe('/en?screen=dashboard');
  });
});

describe('serializeGrammar — foreign segments (H3)', () => {
  it('re-emits both foreign parameters after a write to a real entry — the reviewer\'s exact probe', () => {
    const parsed = parseGrammar('/en?screen=app&utm_source=news&code=oauth123');
    const written = {
      ...parsed,
      entries: parsed.entries.map((e) => (e.domainKey === 'screen' ? { ...e, params: [{ name: 'tab', value: '2' }] } : e)),
    };
    expect(serializeGrammar(written)).toBe('/en?screen=app;tab=2&code=oauth123&utm_source=news');
  });

  it('an OAuth-style return (code, state) survives a write untouched', () => {
    const parsed = parseGrammar('/en?code=abc123&state=xyz789');
    const written = { ...parsed, entries: [...parsed.entries, entry('screen', 'dashboard')] };
    expect(serializeGrammar(written)).toBe('/en?code=abc123&state=xyz789&screen=dashboard');
  });

  it('round-trips a URL carrying only foreign segments byte-exactly', () => {
    const url = '/en?utm_source=news&fbclid=abc_123';
    const parsed = parseGrammar(url);
    expect(parsed.entries).toEqual([]);
    expect(parsed.foreignSegments).toEqual(['utm_source=news', 'fbclid=abc_123']);
    expect(serializeGrammar(parsed)).toBe(url);
  });

  it('re-emits a malformed-looking (warned) segment verbatim, after the entries', () => {
    const parsed = parseGrammar('/en?screen=Dashboard&widgets=line-a');
    expect(serializeGrammar(parsed)).toBe('/en?widgets=line-a&screen=Dashboard');
  });
});

describe('serializeGrammar — validation errors', () => {
  const base: SerializeInput = { shellSubroute: '/en', hash: undefined, entries: [], foreignSegments: [] };

  it('throws invalid-domain-key for a malformed domainKey, naming the offending entry', () => {
    const input = { ...base, entries: [entry('a.b', 'dashboard')] };
    const error = expectRoutingError(() => serializeGrammar(input));
    expect(error.code).toBe('invalid-domain-key');
    expect(error.entry).toEqual(input.entries[0]);
  });

  it('throws invalid-extension-token for a malformed extension, naming the offending entry', () => {
    const input = { ...base, entries: [entry('screen', 'Dashboard')] };
    const error = expectRoutingError(() => serializeGrammar(input));
    expect(error.code).toBe('invalid-extension-token');
    expect(error.entry).toEqual(input.entries[0]);
  });

  it('throws invalid-param-name for a param whose own name is the empty string, naming the offending entry', () => {
    // `param-name = 1*( pchar-safe | pct-encoded )` (ADR 0003, "Tokens")
    // requires at least one character — an unvalidated empty name would
    // serialize to `screen=app;=x`, which reparses as a malformed entry,
    // dropped whole (grammar-parse.test.ts covers that reparse side).
    const input = {
      ...base,
      entries: [entry('screen', 'app', [{ name: '', value: 'x' }])],
    };
    const error = expectRoutingError(() => serializeGrammar(input));
    expect(error.code).toBe('invalid-param-name');
    expect(error.entry).toEqual(input.entries[0]);
  });

  it('throws duplicate-param-name for two params of the identical name in one entry', () => {
    const input = {
      ...base,
      entries: [
        entry('sheet', 'search', [
          { name: 'q', value: 'first' },
          { name: 'q', value: 'second' },
        ]),
      ],
    };
    const error = expectRoutingError(() => serializeGrammar(input));
    expect(error.code).toBe('duplicate-param-name');
  });

  it('throws duplicate-extension for two entries sharing domainKey and extension', () => {
    const input = {
      ...base,
      entries: [entry('widgets', 'line-a'), entry('widgets', 'line-a')],
    };
    const error = expectRoutingError(() => serializeGrammar(input));
    expect(error.code).toBe('duplicate-extension');
  });

  it('throws duplicate-extension even when the identical Entry object occupies both positions', () => {
    const shared = entry('widgets', 'line-a');
    const input = { ...base, entries: [shared, shared] };
    const error = expectRoutingError(() => serializeGrammar(input));
    expect(error.code).toBe('duplicate-extension');
  });
});

describe('serializeGrammar — percent-encoding table', () => {
  it('escapes ; = & # % + and space, leaves pchar-safe raw, and UTF-8-escapes non-ASCII', () => {
    const input = {
      ...base(),
      entries: [entry('sheet', 'search', [{ name: 'q', value: ';=&#%+ é' }])],
    };
    const result = serializeGrammar(input);
    expect(result).toBe('/en?sheet=search;q=%3B%3D%26%23%25%2B%20%C3%A9');
  });

  it('leaves the pchar-safe set raw, e.g. a value like settings/general', () => {
    const input = {
      ...base(),
      entries: [entry('sheet', 'search', [{ name: 'route', value: 'settings/general' }])],
    };
    expect(serializeGrammar(input)).toBe('/en?sheet=search;route=settings/general');
  });

  function base(): SerializeInput {
    return { shellSubroute: '/en', hash: undefined, entries: [], foreignSegments: [] };
  }
});

describe('serializeGrammar — shell subroute validation (H1)', () => {
  const withSubroute = (shellSubroute: string) =>
    ({ shellSubroute, hash: undefined, entries: [entry('screen', 'app')], foreignSegments: [] }) satisfies SerializeInput;

  it.each(['?', '#', '&'])('throws invalid-shell-subroute for a shell subroute containing %j', (char) => {
    const error = expectRoutingError(() => serializeGrammar(withSubroute(`/en${char}injected`)));
    expect(error.code).toBe('invalid-shell-subroute');
    expect(error.value).toBe(`/en${char}injected`);
  });

  it('leaves a normal subroute unaffected', () => {
    expect(serializeGrammar(withSubroute('/en'))).toBe('/en?screen=app');
  });

  it("throws instead of corrupting — the reviewer's own probe (/en?injected=1 plus one written entry)", () => {
    const error = expectRoutingError(() =>
      serializeGrammar({
        shellSubroute: '/en?injected=1',
        hash: undefined,
        entries: [entry('screen', 'app')],
        foreignSegments: [],
      }),
    );
    expect(error.code).toBe('invalid-shell-subroute');
  });
});

describe('serializeGrammar — foreign segment validation (D2)', () => {
  const withForeignSegment = (segment: string) =>
    ({
      shellSubroute: '/en',
      hash: undefined,
      entries: [entry('screen', 'app')],
      foreignSegments: [segment],
    }) satisfies SerializeInput;

  it("throws invalid-foreign-segment for a hand-built segment carrying '&' — the reviewer's own probe", () => {
    const error = expectRoutingError(() => serializeGrammar(withForeignSegment('x&screen=evil')));
    expect(error.code).toBe('invalid-foreign-segment');
    expect(error.value).toBe('x&screen=evil');
  });

  it("throws invalid-foreign-segment for a hand-built segment carrying '#' — the reviewer's own probe", () => {
    const error = expectRoutingError(() => serializeGrammar(withForeignSegment('x#frag')));
    expect(error.code).toBe('invalid-foreign-segment');
    expect(error.value).toBe('x#frag');
  });

  it('leaves a normal foreign segment unaffected', () => {
    expect(serializeGrammar(withForeignSegment('utm_source=news'))).toBe('/en?screen=app&utm_source=news');
  });
});

describe('serializeGrammar — optional foreignSegments field (D3)', () => {
  it('serializes an input with foreignSegments omitted entirely, emitting only the entries', () => {
    const input: SerializeInput = { shellSubroute: '/en', hash: undefined, entries: [entry('screen', 'app')] };
    expect(serializeGrammar(input)).toBe('/en?screen=app');
  });

  it('treats an omitted foreignSegments list as zero entries for the bare-subroute case too', () => {
    const input: SerializeInput = { shellSubroute: '/en', hash: undefined, entries: [] };
    expect(serializeGrammar(input)).toBe('/en');
  });
});
