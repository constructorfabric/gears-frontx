import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeHistoryAdapter } from '../history/fake-history-adapter.js';
import { backProjectEntries, expectRoutingError, resetRealm } from '../helpers.js';
import type { DomainKey, ExtensionToken } from '../../types/index.js';

// FEATURE (route-ownership-signal) §3, "URL Back-Projection Helper Via
// Own-Key Rewrite" (cpt-frontx-algo-routing-route-ownership-signal-url-back-projection);
// DoD `cpt-frontx-dod-routing-route-ownership-signal-url-back-projection`.
//
// Worked-example URLs are copied verbatim from DESIGN §1.1 / ADR 0003
// ("Confirmation", examples 7.1, 7.2, 7.7).

function currentUrl(adapter: FakeHistoryAdapter): string {
  const location = adapter.getLocation();
  let url = location.path;
  if (location.search !== '') {
    url += `?${location.search}`;
  }
  if (location.hash !== '') {
    url += `#${location.hash}`;
  }
  return url;
}

/**
 * The raw string the most recent `push`/`replace` call actually wrote —
 * asserted directly, never re-split and re-joined through `getLocation()`
 * the way `currentUrl` is. Re-splitting can mask a defect in the exact
 * written string: `Location.hash` is `''`, not `undefined`, when the
 * current URL carries no fragment at all, and `currentUrl`'s own
 * `location.hash !== ''` guard would silently absorb a spurious extra `#`
 * a buggy write left in place on the way back out. Every assertion in this
 * file that checks what a `backProjectEntries` call itself wrote (as
 * opposed to what a later `go()` step restored) uses this helper instead.
 */
function lastWrittenUrl(adapter: FakeHistoryAdapter): string | undefined {
  return adapter.lastWrite;
}

beforeEach(() => {
  resetRealm('/en');
});

describe('url-back-projection — 7.1 reference link', () => {
  const REFERENCE_LINK =
    '/en?screen=dashboard;orientation=left' +
    '&sheet=tenant-details;tenantId=456' +
    '&sheet=user-contacts;contactId=123;view=active' +
    '&widgets=line-a;range=7d' +
    '&widgets=line-b;range=30d' +
    '&widgets=pie;metric=revenue';

  it('adds a fourth widgets occupant, leaving screen/sheet/widgets entries untouched (Worked Example: The Reference Link, "Opening a fourth widgets occupant")', () => {
    const adapter = resetRealm(REFERENCE_LINK);

    backProjectEntries(
      'widgets' as DomainKey,
      { added: [{ extension: 'line-c' as ExtensionToken, params: [{ name: 'range', value: '1d' }] }] },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe(
      '/en?screen=dashboard;orientation=left' +
        '&sheet=tenant-details;tenantId=456' +
        '&sheet=user-contacts;contactId=123;view=active' +
        '&widgets=line-a;range=7d' +
        '&widgets=line-b;range=30d' +
        '&widgets=pie;metric=revenue' +
        '&widgets=line-c;range=1d',
    );
  });

  it('changes the screen entry\'s own payload in place, at its existing position, leaving every other entry untouched', () => {
    const adapter = resetRealm(REFERENCE_LINK);

    backProjectEntries(
      'screen' as DomainKey,
      {
        payloadChanged: [
          { extension: 'dashboard' as ExtensionToken, params: [{ name: 'orientation', value: 'right' }] },
        ],
      },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe(
      '/en?screen=dashboard;orientation=right' +
        '&sheet=tenant-details;tenantId=456' +
        '&sheet=user-contacts;contactId=123;view=active' +
        '&widgets=line-a;range=7d' +
        '&widgets=line-b;range=30d' +
        '&widgets=pie;metric=revenue',
    );
  });

  it('an own-key entry interleaved among foreign entries stays interleaved after a payload change, never regrouped into a contiguous block', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d&screen=dashboard;orientation=left&widgets=line-b;range=30d');

    backProjectEntries(
      'screen' as DomainKey,
      { payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [{ name: 'orientation', value: 'right' }] }] },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe(
      '/en?widgets=line-a;range=7d&screen=dashboard;orientation=right&widgets=line-b;range=30d',
    );
  });
});

describe('url-back-projection — 7.7 structural reset (from 7.2, the console example)', () => {
  // `tabs` is the route the `tenants` extension's own zone declares for its
  // nested tabs domain, carrying no reference to `screen` or `tenants` — a
  // domain key never restates an ancestor.
  const CONSOLE_LAYOUT = '/en?screen=tenants;tenantId=ABC&tabs=contacts&modal=create-contact';

  it('reproduces the structural reset worked example exactly: screen swaps tenants for settings, tabs is removed via clearedDomainKeys, modal survives', () => {
    const adapter = resetRealm(CONSOLE_LAYOUT);

    backProjectEntries(
      'screen' as DomainKey,
      {
        replaced: [
          {
            oldExtension: 'tenants' as ExtensionToken,
            entry: { extension: 'settings' as ExtensionToken, params: [] },
          },
        ],
        clearedDomainKeys: ['tabs' as DomainKey],
      },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=settings&modal=create-contact');
  });

  it('issues exactly one history write for the whole composed result (single push call, not one per cleared domain key)', () => {
    const adapter = resetRealm(CONSOLE_LAYOUT);
    let pushCount = 0;
    const originalPush = adapter.pushState.bind(adapter);
    adapter.pushState = (path: string) => {
      pushCount += 1;
      originalPush(path);
    };

    backProjectEntries(
      'screen' as DomainKey,
      {
        replaced: [{ oldExtension: 'tenants' as ExtensionToken, entry: { extension: 'settings' as ExtensionToken, params: [] } }],
        clearedDomainKeys: ['tabs' as DomainKey],
      },
      'push',
    );

    expect(pushCount).toBe(1);
  });

  it('had the call named no key to clear, the nested entry would have survived as a stranded entry', () => {
    const adapter = resetRealm(CONSOLE_LAYOUT);

    backProjectEntries(
      'screen' as DomainKey,
      {
        replaced: [
          { oldExtension: 'tenants' as ExtensionToken, entry: { extension: 'settings' as ExtensionToken, params: [] } },
        ],
      },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=settings&tabs=contacts&modal=create-contact');
  });
});

describe('url-back-projection — Replaced scenario (generic dashboard, §6 acceptance criteria)', () => {
  it('swaps the entry at its old position for the new one and removes exactly the clearedDomainKeys named, and no other entry', () => {
    const adapter = resetRealm('/en?screen=dashboard;orientation=left&panel=info&modal=create-contact');

    backProjectEntries(
      'screen' as DomainKey,
      {
        replaced: [
          { oldExtension: 'dashboard' as ExtensionToken, entry: { extension: 'settings' as ExtensionToken, params: [] } },
        ],
        clearedDomainKeys: ['panel' as DomainKey],
      },
      'replace',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=settings&modal=create-contact');
  });
});

describe('url-back-projection — payload-only change resets nothing nested', () => {
  it('updates the entry\'s own payload in place and removes no entry, because the extension token itself never changed and the caller names no domain key to clear', () => {
    const adapter = resetRealm('/en?screen=dashboard;orientation=left&panel=info');

    backProjectEntries(
      'screen' as DomainKey,
      { payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [{ name: 'orientation', value: 'right' }] }] },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=dashboard;orientation=right&panel=info');
  });
});

describe('url-back-projection — clearedDomainKeys', () => {
  it('applies exactly as given, never inferred: a named key removes its entries, an unnamed sibling survives', () => {
    const adapter = resetRealm('/en?screen=tenants;tenantId=ABC&tabs=contacts&legend=right&modal=create-contact');

    backProjectEntries(
      'screen' as DomainKey,
      { payloadChanged: [{ extension: 'tenants' as ExtensionToken, params: [{ name: 'tenantId', value: 'ABC' }] }], clearedDomainKeys: ['tabs' as DomainKey] },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=tenants;tenantId=ABC&legend=right&modal=create-contact');
  });

  it('a named key no entry carries removes nothing, and the call still issues its one write', () => {
    const adapter = resetRealm('/en?screen=dashboard');

    backProjectEntries(
      'screen' as DomainKey,
      { clearedDomainKeys: ['tabs' as DomainKey] },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=dashboard');
  });

  it('naming the calling domain key itself clears nothing — this domain key\'s own entries are governed by the delta\'s other operations alone', () => {
    const adapter = resetRealm('/en?screen=dashboard;orientation=left');

    backProjectEntries(
      'screen' as DomainKey,
      {
        payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [{ name: 'orientation', value: 'right' }] }],
        clearedDomainKeys: ['screen' as DomainKey],
      },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=dashboard;orientation=right');
  });

  it('throws invalid-domain-key for a malformed cleared domain key, before anything is written', () => {
    const adapter = resetRealm('/en?screen=tenants&tabs=contacts');

    const error = expectRoutingError(() =>
      backProjectEntries('screen' as DomainKey, { clearedDomainKeys: ['Tabs!' as DomainKey] }, 'push'),
    );
    expect(error.code).toBe('invalid-domain-key');
    expect(adapter.lastWrite).toBeUndefined();
  });
});

describe('url-back-projection — Reordered scenario', () => {
  it('reassigns two entries to the same two positions they already occupied, in the new order, with no structural reset and no effect on other domains', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d&modal=create-contact&widgets=line-b;range=30d');

    backProjectEntries(
      'widgets' as DomainKey,
      { reordered: ['line-b' as ExtensionToken, 'line-a' as ExtensionToken] },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?widgets=line-b;range=30d&modal=create-contact&widgets=line-a;range=7d');
  });
});

describe('url-back-projection — unresolved entry preserved', () => {
  it('leaves an entry whose extension matches no registration untouched when a back-projection call targets a different domain', () => {
    const adapter = resetRealm('/en?widgets=chart-old;range=90d&screen=dashboard;orientation=left');

    backProjectEntries('screen' as DomainKey, { payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [{ name: 'orientation', value: 'right' }] }] }, 'push');

    expect(lastWrittenUrl(adapter)).toBe('/en?widgets=chart-old;range=90d&screen=dashboard;orientation=right');
  });
});

describe('url-back-projection — inert (no-op) delta', () => {
  it('an empty delta still issues the one required history write, but writes back the identical URL text', () => {
    const adapter = resetRealm('/en?screen=dashboard;orientation=left');

    backProjectEntries('screen' as DomainKey, {}, 'push');

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=dashboard;orientation=left');
  });
});

describe('url-back-projection — route-style single-entry domain', () => {
  it('adds the sole entry of a freshly-addressed domain that carried none before', () => {
    const adapter = resetRealm('/en');

    backProjectEntries('route' as DomainKey, { added: [{ extension: 'home' as ExtensionToken, params: [] }] }, 'push');

    expect(lastWrittenUrl(adapter)).toBe('/en?route=home');
  });

  it('removes the sole entry of a single-entry domain, leaving a bare subroute', () => {
    const adapter = resetRealm('/en?route=home');

    backProjectEntries('route' as DomainKey, { removed: ['home' as ExtensionToken] }, 'replace');

    expect(lastWrittenUrl(adapter)).toBe('/en');
  });
});

describe('url-back-projection — verb is the caller\'s own choice', () => {
  it('push appends a new history entry a back step can undo', async () => {
    const adapter = resetRealm('/en?modal=create-contact');

    backProjectEntries('modal' as DomainKey, { removed: ['create-contact' as ExtensionToken] }, 'push');
    expect(lastWrittenUrl(adapter)).toBe('/en');

    adapter.go(-1);
    await vi.waitFor(() => expect(currentUrl(adapter)).toBe('/en?modal=create-contact'));
  });

  it('replace overwrites the current entry, so a later back step does not resurrect what was closed', async () => {
    const adapter = resetRealm('/en?other=marker');
    adapter.pushState('/en?other=marker&modal=create-contact');

    backProjectEntries('modal' as DomainKey, { removed: ['create-contact' as ExtensionToken] }, 'replace');
    expect(lastWrittenUrl(adapter)).toBe('/en?other=marker');

    adapter.go(-1);
    // The `replace` overwrote the "modal open" entry itself, so stepping
    // back lands one entry further than that, at the original
    // `/en?other=marker` push — never resurrecting the closed modal.
    await vi.waitFor(() => expect(currentUrl(adapter)).toBe('/en?other=marker'));
  });
});

describe('url-back-projection — zero entries produces a bare subroute', () => {
  it('serializes with no "?" at all once the composed entry list is empty', () => {
    const adapter = resetRealm('/en?modal=create-contact');

    backProjectEntries('modal' as DomainKey, { removed: ['create-contact' as ExtensionToken] }, 'push');

    expect(lastWrittenUrl(adapter)).toBe('/en');
  });
});

describe('url-back-projection — hash preserved verbatim', () => {
  it('copies the current hash unchanged into the serialized write', () => {
    const adapter = resetRealm('/en?screen=dashboard;orientation=left#section-2');

    backProjectEntries(
      'screen' as DomainKey,
      { payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [{ name: 'orientation', value: 'right' }] }] },
      'push',
    );

    expect(lastWrittenUrl(adapter)).toBe('/en?screen=dashboard;orientation=right#section-2');
  });
});

describe('url-back-projection — synchronous validation', () => {
  it('throws RoutingError(invalid-domain-key) for a malformed domain key, before any parsing runs', () => {
    resetRealm('/en?screen=dashboard');

    const error = expectRoutingError(() => backProjectEntries('Screen!' as DomainKey, {}, 'push'));
    expect(error.code).toBe('invalid-domain-key');
  });

  // §6 Acceptance Criteria: "a domain key that is not a single valid name —
  // `screen.tenants.tabs` among them".
  it('throws RoutingError(invalid-domain-key) for the composite-shaped "screen.tenants.tabs", which is no longer a valid single-name domain key', () => {
    const adapter = resetRealm('/en?screen=dashboard');

    const error = expectRoutingError(() => backProjectEntries('screen.tenants.tabs' as DomainKey, {}, 'push'));
    expect(error.code).toBe('invalid-domain-key');
    expect(adapter.lastWrite).toBeUndefined();
  });

  it('throws RoutingError(invalid-extension-token) naming the first offending value in the delta\'s added list', () => {
    resetRealm('/en?screen=dashboard');

    const error = expectRoutingError(() =>
      backProjectEntries('screen' as DomainKey, { added: [{ extension: 'Bad Token' as ExtensionToken, params: [] }] }, 'push'),
    );
    expect(error.code).toBe('invalid-extension-token');
    expect(error.value).toBe('Bad Token');
  });

  it('throws RoutingError(invalid-extension-token) for a malformed token in the replaced list\'s old extension', () => {
    resetRealm('/en?screen=dashboard');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'screen' as DomainKey,
        { replaced: [{ oldExtension: 'Bad!' as ExtensionToken, entry: { extension: 'settings' as ExtensionToken, params: [] } }] },
        'push',
      ),
    );
    expect(error.code).toBe('invalid-extension-token');
  });

  it('throws RoutingError(invalid-extension-token) for a malformed token in the reordered list', () => {
    resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d');

    const error = expectRoutingError(() =>
      backProjectEntries('widgets' as DomainKey, { reordered: ['Bad!' as ExtensionToken] }, 'push'),
    );
    expect(error.code).toBe('invalid-extension-token');
  });

  it('validates the payload-changed list\'s own extension tokens too, per the ADR 0003 MUST covering every input path naming an extension token', () => {
    resetRealm('/en?screen=dashboard;orientation=left');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'screen' as DomainKey,
        { payloadChanged: [{ extension: 'Bad!' as ExtensionToken, params: [] }] },
        'push',
      ),
    );
    expect(error.code).toBe('invalid-extension-token');
    expect(error.value).toBe('Bad!');
  });
});

describe('url-back-projection — reordered must be a permutation of the surviving own entries', () => {
  it('throws RoutingError(reordered-not-permutation) when reordered omits a surviving own entry', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d&widgets=line-c;range=1d');

    // Only naming "line-c" while "line-a"/"line-b" also survive unchanged
    // would, under a reference-identity duplicate-scan, reuse the same
    // `Entry` object at two positions in the composed list
    // (`w=line-c&w=line-b&w=line-c`) instead of being rejected.
    const error = expectRoutingError(() =>
      backProjectEntries('widgets' as DomainKey, { reordered: ['line-c' as ExtensionToken] }, 'push'),
    );
    expect(error.code).toBe('reordered-not-permutation');

    // No write happened — the rejected call never reached history.
    expect(adapter.lastWrite).toBeUndefined();
  });

  it('throws RoutingError(reordered-not-permutation) when reordered names the identical surviving token twice', () => {
    resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'widgets' as DomainKey,
        { reordered: ['line-a' as ExtensionToken, 'line-a' as ExtensionToken] },
        'push',
      ),
    );
    expect(error.code).toBe('reordered-not-permutation');
  });

  it('throws RoutingError(reordered-not-permutation) when reordered names a token this domain does not currently carry', () => {
    resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'widgets' as DomainKey,
        { reordered: ['line-a' as ExtensionToken, 'line-b' as ExtensionToken, 'line-z' as ExtensionToken] },
        'push',
      ),
    );
    expect(error.code).toBe('reordered-not-permutation');
  });

  it('names a replaced entry by the token the current location carries, not by the one the same delta introduces', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d');

    // `reordered` orders positions; `replaced` decides what stands in them.
    // Naming the incoming token here would be naming an entry the current
    // location does not carry.
    backProjectEntries(
      'widgets' as DomainKey,
      {
        replaced: [
          { oldExtension: 'line-a' as ExtensionToken, entry: { extension: 'pie' as ExtensionToken, params: [] } },
        ],
        reordered: ['line-b' as ExtensionToken, 'line-a' as ExtensionToken],
      },
      'push',
    );

    expect(adapter.lastWrite).toBe('/en?widgets=line-b;range=30d&widgets=pie');

    resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d');
    const error = expectRoutingError(() =>
      backProjectEntries(
        'widgets' as DomainKey,
        {
          replaced: [
            { oldExtension: 'line-a' as ExtensionToken, entry: { extension: 'pie' as ExtensionToken, params: [] } },
          ],
          reordered: ['line-b' as ExtensionToken, 'pie' as ExtensionToken],
        },
        'push',
      ),
    );
    expect(error.code).toBe('reordered-not-permutation');
  });

  it('does NOT throw when reordered is exactly a permutation of the surviving own entries', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d&widgets=line-c;range=1d');

    backProjectEntries(
      'widgets' as DomainKey,
      { reordered: ['line-c' as ExtensionToken, 'line-a' as ExtensionToken, 'line-b' as ExtensionToken] },
      'push',
    );

    expect(adapter.lastWrite).toBe('/en?widgets=line-c;range=1d&widgets=line-a;range=7d&widgets=line-b;range=30d');
  });
});

// A `replaced` pair exists to stand a new entry at an old entry's own
// position (FEATURE §3, step 3.1). When the current location carries no
// entry under the named `oldExtension`, there is no such position, so the
// operation the pair asks for cannot be performed at all.
describe('url-back-projection — replaced must name an entry this domain key currently carries', () => {
  it('throws RoutingError(replaced-old-extension-absent) and writes nothing when oldExtension is absent', () => {
    const adapter = resetRealm('/en?x=q&z=1');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'w' as DomainKey,
        {
          replaced: [
            { oldExtension: 'a' as ExtensionToken, entry: { extension: 'b' as ExtensionToken, params: [] } },
          ],
        },
        'push',
      ),
    );
    expect(error.code).toBe('replaced-old-extension-absent');

    expect(adapter.lastWrite).toBeUndefined();
    expect(currentUrl(adapter)).toBe('/en?x=q&z=1');
  });

  it('leaves every other domain key\'s own entries in place — nothing is written at all on the refusal, clearedDomainKeys included', () => {
    const adapter = resetRealm('/en?w=c&x=q&y=r');

    expectRoutingError(() =>
      backProjectEntries(
        'w' as DomainKey,
        {
          replaced: [
            { oldExtension: 'a' as ExtensionToken, entry: { extension: 'b' as ExtensionToken, params: [] } },
          ],
          clearedDomainKeys: ['x' as DomainKey],
        },
        'push',
      ),
    );

    expect(adapter.lastWrite).toBeUndefined();
    expect(currentUrl(adapter)).toBe('/en?w=c&x=q&y=r');
  });

  it('writes nothing at all when one replaced pair matches and another does not', () => {
    // The refusal is atomic: the matching pair is not written on its own,
    // partially applying a delta the caller gave as one unit.
    const adapter = resetRealm('/en?w=c&w=d&y=r');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'w' as DomainKey,
        {
          replaced: [
            { oldExtension: 'c' as ExtensionToken, entry: { extension: 'e' as ExtensionToken, params: [] } },
            { oldExtension: 'a' as ExtensionToken, entry: { extension: 'b' as ExtensionToken, params: [] } },
          ],
        },
        'push',
      ),
    );
    expect(error.code).toBe('replaced-old-extension-absent');

    expect(adapter.lastWrite).toBeUndefined();
    expect(currentUrl(adapter)).toBe('/en?w=c&w=d&y=r');
  });

  it('names the absent position ahead of a reordered list that is also not a permutation', () => {
    // Both are wrong; the absent position is the primary cause, since a
    // reorder is defined over the survivors the replacement would produce.
    resetRealm('/en?w=c&w=d');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'w' as DomainKey,
        {
          replaced: [
            { oldExtension: 'a' as ExtensionToken, entry: { extension: 'b' as ExtensionToken, params: [] } },
          ],
          reordered: ['c' as ExtensionToken],
        },
        'push',
      ),
    );
    expect(error.code).toBe('replaced-old-extension-absent');
  });

  it('carries the domain key and the absent old extension token, so a consumer can recompute its delta', () => {
    resetRealm('/en?w=c');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'w' as DomainKey,
        {
          replaced: [
            { oldExtension: 'a' as ExtensionToken, entry: { extension: 'b' as ExtensionToken, params: [] } },
          ],
        },
        'push',
      ),
    );
    expect(error.domainKey).toBe('w');
    expect(error.value).toBe('a');
  });

  it('leaves the tolerance for a removed or payload-changed token this domain key does not carry unchanged', () => {
    // FEATURE §3, No-op note: those two name an operation that is already
    // satisfied or inert, so they still write. Only `replaced` refuses.
    const adapter = resetRealm('/en?w=c');

    backProjectEntries('w' as DomainKey, { removed: ['a' as ExtensionToken] }, 'push');
    expect(adapter.lastWrite).toBe('/en?w=c');

    backProjectEntries(
      'w' as DomainKey,
      { payloadChanged: [{ extension: 'a' as ExtensionToken, params: [{ name: 'p', value: '1' }] }] },
      'push',
    );
    expect(adapter.lastWrite).toBe('/en?w=c');
  });
});

// The optional fourth `pageHash` parameter — the
// single write path for the page hash. Given (including `''`), it
// overrides whatever hash is currently in the URL; absent, the current
// hash is preserved verbatim, the pre-existing behaviour every other
// describe block in this file already exercises implicitly.
describe('url-back-projection — optional pageHash parameter', () => {
  it('given, replaces the current page hash in the same single write', () => {
    const adapter = resetRealm('/en?screen=dashboard#old-hash');

    backProjectEntries(
      'screen' as DomainKey,
      { payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [] }] },
      'push',
      'new-hash',
    );

    expect(adapter.lastWrite).toBe('/en?screen=dashboard#new-hash');
  });

  it('absent, preserves the current page hash verbatim', () => {
    const adapter = resetRealm('/en?screen=dashboard#kept-hash');

    backProjectEntries(
      'screen' as DomainKey,
      { payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [] }] },
      'push',
    );

    expect(adapter.lastWrite).toBe('/en?screen=dashboard#kept-hash');
  });

  it('an empty string clears the current page hash', () => {
    const adapter = resetRealm('/en?screen=dashboard#old-hash');

    backProjectEntries(
      'screen' as DomainKey,
      { payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [] }] },
      'push',
      '',
    );

    expect(adapter.lastWrite).toBe('/en?screen=dashboard');
  });

  it('given on a URL that carries no hash yet, adds it in the same single write', () => {
    const adapter = resetRealm('/en?screen=dashboard');

    backProjectEntries(
      'screen' as DomainKey,
      { payloadChanged: [{ extension: 'dashboard' as ExtensionToken, params: [] }] },
      'push',
      'fresh-hash',
    );

    expect(adapter.lastWrite).toBe('/en?screen=dashboard#fresh-hash');
  });
});

describe('url-back-projection — a delta the current location cannot accommodate', () => {
  it('refuses to write when an added token is already present under that domain key', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d');

    const error = expectRoutingError(() =>
      backProjectEntries(
        'widgets' as DomainKey,
        { added: [{ extension: 'line-a' as ExtensionToken, params: [{ name: 'range', value: '1d' }] }] },
        'push',
      ),
    );

    expect(error.code).toBe('duplicate-extension');
    expect(adapter.lastWrite).toBeUndefined();
  });

  it('accepts the same token removed and added in one delta — the removal clears its position first', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d');

    backProjectEntries(
      'widgets' as DomainKey,
      {
        removed: ['line-a' as ExtensionToken],
        added: [{ extension: 'line-a' as ExtensionToken, params: [{ name: 'range', value: '1d' }] }],
      },
      'push',
    );

    expect(adapter.lastWrite).toBe('/en?widgets=line-b;range=30d&widgets=line-a;range=1d');
  });
});

describe('url-back-projection — what one call always does', () => {
  it('writes on every call, so two consecutive empty deltas each push a history entry', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d');
    const pushed: string[] = [];
    const pushState = adapter.pushState.bind(adapter);
    vi.spyOn(adapter, 'pushState').mockImplementation((path: string, state?: unknown) => {
      pushed.push(path);
      pushState(path, state);
    });

    backProjectEntries('widgets' as DomainKey, {}, 'push');
    backProjectEntries('widgets' as DomainKey, {}, 'push');

    // Nothing compares the composed URL against the current one: an empty
    // delta is also how a caller writes a page hash and nothing else, and
    // the consumer is the side that knows whether anything changed.
    expect(pushed).toEqual([
      '/en?widgets=line-a;range=7d',
      '/en?widgets=line-a;range=7d',
    ]);
  });

  it('carries an entry under another domain key through in canonical encoding, and a foreign segment byte for byte', () => {
    const adapter = resetRealm('/en?other=x;q=%41;r=a%20b&code=4%2F0AX&widgets=line-a;range=7d');

    backProjectEntries(
      'widgets' as DomainKey,
      { payloadChanged: [{ extension: 'line-a' as ExtensionToken, params: [{ name: 'range', value: '1d' }] }] },
      'push',
    );

    // `%41` covers a character the encoder does not escape, so it comes back
    // decoded; `%20` covers one it does, so it keeps its escape. `code=…`
    // never parsed as an entry at all and survives byte for byte, re-emitted
    // after the entries.
    expect(adapter.lastWrite).toBe('/en?other=x;q=A;r=a%20b&widgets=line-a;range=1d&code=4%2F0AX');
  });
});
