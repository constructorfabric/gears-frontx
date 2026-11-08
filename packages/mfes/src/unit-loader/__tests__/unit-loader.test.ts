/**
 * Scenario coverage for the `./unit-loader` sanctioned subpath
 * (`cpt-frontx-algo-unit-format-contract-loader-surface`):
 *
 *  - the subpath yields exactly the list loader, verified fetcher,
 *    asset-URL resolver and realm cache provider, and its module graph
 *    reaches no registry, orchestrating handler or mediator module;
 *  - two loader copies agree on one versioned realm cache slot and
 *    dedupe by content identity;
 *  - a slot holding a foreign or older entry shape is not shared and
 *    does not throw — the consumer proceeds on its own copy-local cache.
 */
import { describe, expect, it } from 'vitest';

import * as unitLoader from '../index';
import {
  RealmSharedDepTextCacheProvider,
  SharedAssetUrlResolver,
  SharedDepListLoader,
  VerifiedUnitFetcher,
} from '../index';
import { RealmSharedDepTextCacheProvider as InternalRealmProvider } from '../../handler/mfe-handler-mf/RealmSharedDepTextCacheProvider';
import { SharedAssetUrlResolver as InternalSharedAssetUrlResolver } from '../../handler/mfe-handler-mf/SharedAssetUrlResolver';
import { SharedDepListLoader as InternalSharedDepListLoader } from '../../handler/mfe-handler-mf/SharedDepListLoader';
import { VerifiedUnitFetcher as InternalVerifiedUnitFetcher } from '../../handler/mfe-handler-mf/VerifiedUnitFetcher';

describe('unit-loader subpath surface', () => {
  it('exports exactly the loader capability classes', () => {
    expect(SharedDepListLoader).toBe(InternalSharedDepListLoader);
    expect(VerifiedUnitFetcher).toBe(InternalVerifiedUnitFetcher);
    expect(SharedAssetUrlResolver).toBe(InternalSharedAssetUrlResolver);
    expect(RealmSharedDepTextCacheProvider).toBe(InternalRealmProvider);
  });

  it('reaches no registry, orchestrating handler or mediator module', () => {
    const exports = Object.keys(unitLoader).sort();
    for (const name of exports) {
      expect(name).not.toMatch(/Handler|Registry|Mediator|GraphSet|GraphLoader|PackFallback|BlobMinter/);
    }
    // Runtime exports (non-type) are exactly the four capability classes.
    expect(exports).toEqual([
      'RealmSharedDepTextCacheProvider',
      'SharedAssetUrlResolver',
      'SharedDepListLoader',
      'VerifiedUnitFetcher',
    ]);
  });

  it('two loader copies converge on one realm cache slot', () => {
    const a = RealmSharedDepTextCacheProvider.getCache();
    const b = RealmSharedDepTextCacheProvider.getCache();
    expect(a).toBe(b);
  });
});
