import { describe, expect, it, vi } from 'vitest';
import { parseGrammar } from '../../grammar/parse.js';
import { serializeGrammar } from '../../grammar/serialize.js';

// cpt-frontx-algo-routing-navigation-substrate-grammar-parse
// FEATURE §6 Acceptance Criteria — examples 7.1, 7.6, 7.8, malformed,
// duplicate-param, duplicate-extension scenarios (verbatim fixtures).

describe('parseGrammar — example 7.1 (reference link, the model task)', () => {
  const url =
    '/en?screen=dashboard;orientation=left' +
    '&sheet=tenant-details;tenantId=456' +
    '&sheet=user-contacts;contactId=123;view=active' +
    '&widgets=line-a;range=7d' +
    '&widgets=line-b;range=30d' +
    '&widgets=pie;metric=revenue';

  it('copies the shell subroute verbatim and produces no warnings', () => {
    const result = parseGrammar(url);
    expect(result.shellSubroute).toBe('/en');
    expect(result.hash).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('produces one entry per occupant, in order, each carrying its own params', () => {
    const result = parseGrammar(url);
    expect(result.entries).toEqual([
      { domainKey: 'screen', extension: 'dashboard', params: [{ name: 'orientation', value: 'left' }] },
      {
        domainKey: 'sheet',
        extension: 'tenant-details',
        params: [{ name: 'tenantId', value: '456' }],
      },
      {
        domainKey: 'sheet',
        extension: 'user-contacts',
        params: [
          { name: 'contactId', value: '123' },
          { name: 'view', value: 'active' },
        ],
      },
      { domainKey: 'widgets', extension: 'line-a', params: [{ name: 'range', value: '7d' }] },
      { domainKey: 'widgets', extension: 'line-b', params: [{ name: 'range', value: '30d' }] },
      { domainKey: 'widgets', extension: 'pie', params: [{ name: 'metric', value: 'revenue' }] },
    ]);
  });
});

describe('parseGrammar — example 7.6 (escaping)', () => {
  it('decodes a payload value containing &, =, and a space', () => {
    const result = parseGrammar('/en?sheet=search;q=a%26b%3Dc%20d');
    expect(result.entries).toEqual([
      { domainKey: 'sheet', extension: 'search', params: [{ name: 'q', value: 'a&b=c d' }] },
    ]);
    expect(result.warnings).toEqual([]);
  });
});

describe('parseGrammar — example 7.8 (zero entries)', () => {
  it('parses an empty query string to an empty entry list, not an error', () => {
    const result = parseGrammar('/en');
    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.shellSubroute).toBe('/en');
  });

  it('parses a present-but-empty query string (/en?) identically to no query string at all', () => {
    const result = parseGrammar('/en?');
    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('parseGrammar — foreign segments: plainly not an entry, no warning', () => {
  it('keeps a segment with no "=", or a candidate domain key outside the domain-key production, as a foreign segment with no warning', () => {
    const result = parseGrammar('/en?screen&a.b=x&widgets=line-a;range=7d');
    expect(result.entries).toEqual([
      { domainKey: 'widgets', extension: 'line-a', params: [{ name: 'range', value: '7d' }] },
    ]);
    expect(result.foreignSegments).toEqual(['screen', 'a.b=x']);
    expect(result.warnings).toEqual([]);
  });

  it('keeps an analytics parameter whose key fails the name alphabet (utm_source) as foreign, while an OAuth-shaped code=value still parses as a real entry', () => {
    const result = parseGrammar('/en?screen=app&utm_source=news&code=oauth123');
    expect(result.entries).toEqual([
      { domainKey: 'screen', extension: 'app', params: [] },
      { domainKey: 'code', extension: 'oauth123', params: [] },
    ]);
    expect(result.foreignSegments).toEqual(['utm_source=news']);
    expect(result.warnings).toEqual([]);
  });

  it('silently ignores an empty raw entry from a doubled or trailing "&", with no warning and not as a foreign segment', () => {
    const result = parseGrammar('/en?screen=dashboard&&sheet=search&');
    expect(result.entries).toHaveLength(2);
    expect(result.foreignSegments).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('parseGrammar — malformed-looking entries: still warn, and are also kept foreign', () => {
  it('drops the whole entry on a malformed percent-escape, reporting it as malformed-entry and keeping it foreign', () => {
    const result = parseGrammar('/en?sheet=search;q=%zz&screen=dashboard');
    expect(result.entries).toEqual([
      { domainKey: 'screen', extension: 'dashboard', params: [] },
    ]);
    expect(result.foreignSegments).toEqual(['sheet=search;q=%zz']);
    expect(result.warnings).toEqual([{ code: 'malformed-entry', rawEntry: 'sheet=search;q=%zz' }]);
  });
});

describe('parseGrammar — warning scope: only a segment plainly shaped as an entry may warn', () => {
  it('keeps a single-segment key with an invalid extension as foreign, with no warning, when nothing else marks it as ours — indistinguishable from an unrelated query parameter', () => {
    const url = '/en?page=2&utm_source=news&code=4%2F0AX&state=eyJhbGciOiJIUzI1NiJ9&flag&screen=Dashboard';
    const result = parseGrammar(url);
    expect(result.entries).toEqual([]);
    expect(result.foreignSegments).toEqual([
      'page=2',
      'utm_source=news',
      'code=4%2F0AX',
      'state=eyJhbGciOiJIUzI1NiJ9',
      'flag',
      'screen=Dashboard',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('survives a write unchanged — the zero-warning foreign segments round-trip byte-exact', () => {
    const url = '/en?page=2&utm_source=news&code=4%2F0AX&state=eyJhbGciOiJIUzI1NiJ9&flag';
    const parsed = parseGrammar(url);
    const written = serializeGrammar({
      shellSubroute: parsed.shellSubroute,
      hash: parsed.hash,
      entries: parsed.entries,
      foreignSegments: parsed.foreignSegments,
    });
    expect(written).toBe(url);
    expect(parseGrammar(written).warnings).toEqual([]);
  });

  it('treats a dotted candidate domain key as a silent foreign segment — domain-key = name admits no "." at all', () => {
    const result = parseGrammar('/en?screen.app.panel=Bad_1&widgets=line-a;range=7d');
    expect(result.entries).toEqual([
      { domainKey: 'widgets', extension: 'line-a', params: [{ name: 'range', value: '7d' }] },
    ]);
    expect(result.foreignSegments).toEqual(['screen.app.panel=Bad_1']);
    expect(result.warnings).toEqual([]);
  });

  it('still warns when the raw segment carries ";" parameters, even for a single-segment key with an invalid extension', () => {
    const result = parseGrammar('/en?screen=Bad_1;tab=x&widgets=line-a;range=7d');
    expect(result.entries).toEqual([
      { domainKey: 'widgets', extension: 'line-a', params: [{ name: 'range', value: '7d' }] },
    ]);
    expect(result.foreignSegments).toEqual(['screen=Bad_1;tab=x']);
    expect(result.warnings).toEqual([{ code: 'malformed-entry', rawEntry: 'screen=Bad_1;tab=x' }]);
  });

  it('does not warn on a well-formed entry that merely carries a parameter value outside the name alphabet — params have no such constraint', () => {
    const result = parseGrammar('/en?screen=app;tab=Bad_1');
    expect(result.entries).toEqual([
      { domainKey: 'screen', extension: 'app', params: [{ name: 'tab', value: 'Bad_1' }] },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('a duplicate extension still reports its own warning, unchanged by the entry-candidate shape rule', () => {
    const result = parseGrammar('/en?widgets=line-a;range=7d&widgets=line-a;range=30d');
    expect(result.warnings).toEqual([
      { code: 'duplicate-extension', rawEntry: 'widgets=line-a;range=30d' },
    ]);
  });
});

describe('parseGrammar — foreign segments: not confused with a real collision', () => {
  it('does not treat a duplicate-extension drop as foreign — it parsed as an entry, it just lost to an earlier one', () => {
    const result = parseGrammar('/en?widgets=line-a;range=7d&widgets=line-a;range=30d');
    expect(result.foreignSegments).toEqual([]);
    expect(result.warnings).toEqual([
      { code: 'duplicate-extension', rawEntry: 'widgets=line-a;range=30d' },
    ]);
  });

  it('an OAuth-style return (code, state) round-trips: both are real entries, not foreign, and produce no warning', () => {
    const result = parseGrammar('/en?code=abc123&state=xyz789');
    expect(result.entries).toEqual([
      { domainKey: 'code', extension: 'abc123', params: [] },
      { domainKey: 'state', extension: 'xyz789', params: [] },
    ]);
    expect(result.foreignSegments).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('parseGrammar — duplicate parameter', () => {
  it('keeps the last value at the first position and reports a warning', () => {
    const result = parseGrammar('/en?sheet=search;q=first;q=second');
    expect(result.entries).toEqual([
      { domainKey: 'sheet', extension: 'search', params: [{ name: 'q', value: 'second' }] },
    ]);
    expect(result.warnings).toEqual([
      { code: 'duplicate-parameter', rawEntry: 'sheet=search;q=first;q=second' },
    ]);
  });

});

describe('parseGrammar — a param name with no value', () => {
  it('parses `;k` and `;k=` to the identical param, so a bare name and an explicit empty value mean one thing', () => {
    const bare = parseGrammar('/en?sheet=tenant-details;k');
    const explicit = parseGrammar('/en?sheet=tenant-details;k=');

    expect(bare.entries[0].params).toEqual([{ name: 'k', value: '' }]);
    expect(explicit.entries[0].params).toEqual(bare.entries[0].params);
  });

  it('writes both back as the bare form, so the two spellings converge on one round trip', () => {
    const roundTrip = (url: string): string => {
      const parsed = parseGrammar(url);
      return serializeGrammar({
        shellSubroute: parsed.shellSubroute,
        hash: parsed.hash,
        entries: parsed.entries,
        foreignSegments: parsed.foreignSegments,
      });
    };

    expect(roundTrip('/en?sheet=tenant-details;k')).toBe('/en?sheet=tenant-details;k');
    expect(roundTrip('/en?sheet=tenant-details;k=')).toBe('/en?sheet=tenant-details;k');
  });
});

describe('parseGrammar — duplicate extension', () => {
  it('keeps the first occurrence under one domain key and drops the second, with a warning', () => {
    const result = parseGrammar('/en?widgets=line-a;range=7d&widgets=line-a;range=30d');
    expect(result.entries).toEqual([
      { domainKey: 'widgets', extension: 'line-a', params: [{ name: 'range', value: '7d' }] },
    ]);
    expect(result.warnings).toEqual([
      { code: 'duplicate-extension', rawEntry: 'widgets=line-a;range=30d' },
    ]);
  });
});

describe('parseGrammar — hash', () => {
  it('copies the hash verbatim without the leading "#"', () => {
    const result = parseGrammar('/en#x');
    expect(result.hash).toBe('x');
    expect(result.entries).toEqual([]);
  });

  it('normalizes a present-but-empty fragment ("/en#") to undefined, identically to no fragment at all', () => {
    const result = parseGrammar('/en#');
    expect(result.hash).toBeUndefined();
  });

  it('normalizes an empty hash given through the object-input form the same way', () => {
    const result = parseGrammar({ shellSubroute: '/en', search: '', hash: '' });
    expect(result.hash).toBeUndefined();
  });
});

describe('parseGrammar — percent-decoding edge cases', () => {
  it('passes a raw "+" through unchanged — no form-style "+"-to-space decoding', () => {
    const result = parseGrammar('/en?sheet=search;q=a+b');
    expect(result.entries).toEqual([
      { domainKey: 'sheet', extension: 'search', params: [{ name: 'q', value: 'a+b' }] },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('assembles a run of consecutive escapes into one multi-byte UTF-8 character (%C3%A9 -> "é")', () => {
    const result = parseGrammar('/en?sheet=search;q=%C3%A9');
    expect(result.entries).toEqual([
      { domainKey: 'sheet', extension: 'search', params: [{ name: 'q', value: 'é' }] },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('drops the whole entry when an escape run is not valid UTF-8 (%FF), reporting it as malformed-entry', () => {
    const result = parseGrammar('/en?sheet=search;q=%FF&screen=dashboard');
    expect(result.entries).toEqual([{ domainKey: 'screen', extension: 'dashboard', params: [] }]);
    expect(result.warnings).toEqual([{ code: 'malformed-entry', rawEntry: 'sheet=search;q=%FF' }]);
  });

  it('drops the whole entry when a trailing "%" has no hex pair to follow it', () => {
    const result = parseGrammar('/en?sheet=search;q=abc%&screen=dashboard');
    expect(result.entries).toEqual([{ domainKey: 'screen', extension: 'dashboard', params: [] }]);
    expect(result.warnings).toEqual([{ code: 'malformed-entry', rawEntry: 'sheet=search;q=abc%' }]);
  });

  it('drops the whole entry when a "%" is followed by only a single hex digit', () => {
    const result = parseGrammar('/en?sheet=search;q=a%4&screen=dashboard');
    expect(result.entries).toEqual([{ domainKey: 'screen', extension: 'dashboard', params: [] }]);
    expect(result.warnings).toEqual([{ code: 'malformed-entry', rawEntry: 'sheet=search;q=a%4' }]);
  });

  it('decodes a mixed-case hex pair identically to an all-uppercase one', () => {
    const result = parseGrammar('/en?sheet=search;q=%c3%A9');
    expect(result.entries).toEqual([
      { domainKey: 'sheet', extension: 'search', params: [{ name: 'q', value: 'é' }] },
    ]);
    expect(result.warnings).toEqual([]);
  });
});

describe('parseGrammar — abandonment drops this entry\'s own already-recorded warnings', () => {
  it('a duplicate-parameter warning recorded earlier in an entry that a later malformed escape abandons does not survive', () => {
    const result = parseGrammar('/en?sheet=search;q=first;q=second;v=%zz');
    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([
      { code: 'malformed-entry', rawEntry: 'sheet=search;q=first;q=second;v=%zz' },
    ]);
  });
});

describe('parseGrammar — an empty param name violates param-name = 1*(...) and drops the whole entry', () => {
  // The rule reaches three spellings of "a segment carrying no name": an
  // empty segment between two ";", a trailing ";", and a segment that is
  // only a value. Each drops the entry whole, keeps its raw text as a
  // foreign segment, and abandons every param already collected for that
  // entry — including a duplicate-parameter warning it had already raised.
  it.each([
    ['two consecutive ";" leave an empty param segment', 'sheet=search;q=x;;a=y'],
    ['a trailing ";" leaves an empty param segment', 'sheet=search;q=x;'],
    ['a param segment is a bare "=value" with nothing before the "="', 'sheet=search;=value'],
  ])('drops the whole entry when %s', (_label, rawEntry) => {
    const result = parseGrammar(`/en?${rawEntry}`);

    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([{ code: 'malformed-entry', rawEntry }]);
    expect(result.foreignSegments).toEqual([rawEntry]);
  });

  it('rolls back a duplicate-parameter warning the abandoned entry had already raised', () => {
    const result = parseGrammar('/en?sheet=search;q=1;q=2;=value');

    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([
      { code: 'malformed-entry', rawEntry: 'sheet=search;q=1;q=2;=value' },
    ]);
  });
});

describe('parseGrammar — an already-split input still carrying its leading delimiter', () => {
  // A `HistoryAdapter` is free to read the host's own location object, which
  // carries `?` on the query string and `#` on the fragment. Passed through
  // verbatim, the `?` used to ride into the first raw entry string, fail its
  // candidate domain key, and take every entry in that query string down with
  // it — no entry, no warning, nothing to see.
  it('parses the entries a query string holds instead of losing them to the leading "?"', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = parseGrammar({ shellSubroute: '/en', search: '?screen=home', hash: undefined });

    expect(result.entries).toEqual([{ domainKey: 'screen', extension: 'home', params: [] }]);
    expect(result.foreignSegments).toEqual([]);
    expect(reported).toHaveBeenCalledTimes(1);
    reported.mockRestore();
  });

  it('strips a leading "#" from an already-split fragment on the same terms', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = parseGrammar({ shellSubroute: '/en', search: 'screen=home', hash: '#section-2' });

    expect(result.hash).toBe('section-2');
    expect(reported).toHaveBeenCalledTimes(1);
    reported.mockRestore();
  });

  it('leaves a second "?" in a URL string alone — only the already-split form is normalized', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = parseGrammar('/en??screen=home');

    expect(result.entries).toEqual([]);
    expect(result.foreignSegments).toEqual(['?screen=home']);
    expect(reported).not.toHaveBeenCalled();
    reported.mockRestore();
  });
});
