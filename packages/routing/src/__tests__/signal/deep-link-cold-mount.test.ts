import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNavigationHistory } from '../../history/singleton.js';
import { createObserver, resetRealm, staticSource as source } from '../helpers.js';
import type { DomainKey } from '../../types/index.js';

// FEATURE (route-ownership-signal) §2, "Deep Link Resolves Through The Route
// Ownership Signal, One Domain At A Time"
// (cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount).
//
// A minimal stand-in for a consumer's own mount mechanism (§1.4, Binding
// obligation): reacts to a transition's diff by recording mount/unmount
// calls and, for a nested-domain route owner, creating that domain's own
// observer — exactly what the flow's steps 3.1-3.3 describe as the
// consumer's own responsibility, never this library's.

beforeEach(() => {
  resetRealm('/en');
});

describe('deep-link-cold-mount — cold URL several domains deep', () => {
  it('resolves and mounts wave-by-wave: outer domain first, nested domain only once its own zone exists', () => {
    resetRealm('/en?screen=tenants;tenantId=ABC&tabs=contacts');
    const mounted: string[] = [];
    const unmounted: string[] = [];

    // Outer `screen` domain's own consumer creates its observer first
    // (flow step 1) — nothing about the nested `tabs` domain exists yet.
    let nestedRelease: (() => void) | undefined;
    createObserver(
      'screen' as DomainKey,
      source([{ extension: 'tenants', routeOwner: 'TenantsScreen' }]),
      (transition) => {
        for (const added of transition.diff.added) {
          mounted.push(`screen=${added}`);
          if (added === 'tenants') {
            // Step 3.3: the mounted route owner's own zone contains a
            // nested domain, declared under its own flat route (`tabs`) —
            // its own consumer creates that domain's own observer (step
            // 3.3.1), repeating from step 1 at that domain.
            nestedRelease = createObserver(
              'tabs' as DomainKey,
              source([{ extension: 'contacts', routeOwner: 'ContactsTab' }]),
              (nestedTransition) => {
                for (const nestedAdded of nestedTransition.diff.added) {
                  mounted.push(`tabs=${nestedAdded}`);
                }
                for (const nestedRemoved of nestedTransition.diff.removed) {
                  unmounted.push(`tabs=${nestedRemoved}`);
                }
              },
            );
          }
        }
        for (const removed of transition.diff.removed) {
          unmounted.push(`screen=${removed}`);
        }
      },
    );

    expect(mounted).toEqual(['screen=tenants', 'tabs=contacts']);
    expect(unmounted).toEqual([]);
    nestedRelease?.();
  });

  it('an entry whose extension matches no registration is reported unresolved; the consumer shows its own fallback without this feature removing it', () => {
    resetRealm('/en?widgets=chart-old;range=90d');
    const fallbackShown: string[] = [];

    createObserver('widgets' as DomainKey, source([]), (transition) => {
      for (const unresolvedToken of transition.diff.unresolved) {
        fallbackShown.push(unresolvedToken);
      }
    });

    expect(fallbackShown).toEqual(['chart-old']);
  });

  it('a URL under already-mounted entries takes no mount/unmount action on a payload-only or reorder-only change', () => {
    const adapter = resetRealm('/en?screen=dashboard;orientation=left');
    const mountActions: string[] = [];

    createObserver('screen' as DomainKey, source([]), (transition) => {
      mountActions.push(
        ...transition.diff.added.map((t) => `mount:${t}`),
        ...transition.diff.removed.map((t) => `unmount:${t}`),
      );
    });
    mountActions.length = 0;

    resolveNavigationHistory(() => adapter).push('/en?screen=dashboard;orientation=right');

    expect(mountActions).toEqual([]);
  });

  it('a back step through history reports the same transition a forward navigation to that URL would', async () => {
    const adapter = resetRealm('/en');
    const transitions: string[][] = [];
    createObserver('screen' as DomainKey, source([]), (transition) => {
      transitions.push(transition.entries.map((e) => e.extension));
    });
    resolveNavigationHistory(() => adapter).push('/en?screen=dashboard');
    transitions.length = 0;

    adapter.go(-1);
    await vi.waitFor(() => expect(transitions).toEqual([[]]));
  });
});

describe('deep-link-cold-mount — nesting inside a domain holding several concurrent occupants', () => {
  it('resolves the one entry addressed to a nested domain nothing but one occupant\'s own zone declares, leaving the widgets domain\'s own two entries unaffected', () => {
    // `legend` is the route `line-a`'s own zone declares for its nested
    // legend domain, carrying no reference to `widgets` or to `line-a` — a
    // domain key never restates an ancestor (ADR 0003,
    // `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`).
    // `line-b` carries no legend entry of its own.
    resetRealm('/en?widgets=line-a;range=7d&legend=right&widgets=line-b;range=30d');

    let legendTransition: string[] = [];
    const releaseLegend = createObserver(
      'legend' as DomainKey,
      source([{ extension: 'right', routeOwner: 'RightLegend' }]),
      (transition) => {
        legendTransition = transition.entries.map((entry) => entry.extension);
      },
    );

    expect(legendTransition).toEqual(['right']);

    let widgetsTransition: string[] = [];
    const releaseWidgets = createObserver('widgets' as DomainKey, source([]), (transition) => {
      widgetsTransition = transition.entries.map((entry) => entry.extension);
    });
    expect(widgetsTransition).toEqual(['line-a', 'line-b']);

    releaseLegend();
    releaseWidgets();
  });
});
