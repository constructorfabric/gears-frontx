/**
 * Verified unit/pack text fetcher: the fetch → SHA-256 verify →
 * realm-cache admit → evict-on-reject discipline `SharedUnitGraphLoader.buildPlan`
 * and the lazy-unit path consume as their `fetchVerified(url, contentHash,
 * cacheKey)` function.
 *
 * Extracted from `MfeHandlerMF` unchanged so a host driving the
 * `./unit-loader` subpath dedupes verified text through the same realm
 * content-identity cache — `RealmSharedDepTextCacheProvider.getCache()`
 * by default — with no hand-written fetch or verification logic
 * (`cpt-frontx-algo-unit-format-contract-loader-surface`).
 *
 * A rejected fetch is evicted only when the cache still holds THIS
 * promise (generation-identity), so a replacement another copy published
 * under the same key is never removed; when an attempt ledger is
 * supplied, every joined or issued entry is recorded so an abandoned
 * attempt can release exactly what it waited on. A load that joined
 * another load's in-flight fetch and sees it reject retries once from its
 * own URL.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';
import type { AttemptSourceTextLedger } from './AttemptSourceTextLedger';
import {
  RealmSharedDepTextCacheProvider,
  type SharedDepTextCache,
} from './RealmSharedDepTextCacheProvider';
import { SharedDepSha256 } from './SharedDepSha256';

export class VerifiedUnitFetcher {
  /**
   * `buildPlan`'s `fetchVerified`: fetch `url`, verify its text against
   * `contentHash`, dedupe through the cache under `cacheKey`.
   */
  readonly fetchVerified: (
    url: string,
    contentHash: string,
    cacheKey: string,
  ) => Promise<string>;

  private readonly cache: SharedDepTextCache;
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly ledger?: AttemptSourceTextLedger;
  private readonly entryId: string;

  constructor(
    fetchText: (url: string) => Promise<string>,
    entryId: string,
    cache: SharedDepTextCache = RealmSharedDepTextCacheProvider.getCache(),
    ledger?: AttemptSourceTextLedger,
  ) {
    this.fetchText = fetchText;
    this.entryId = entryId;
    this.cache = cache;
    this.ledger = ledger;
    this.fetchVerified = (
      url: string,
      contentHash: string,
      cacheKey: string,
    ): Promise<string> => this.fetchVerifiedText(url, contentHash, cacheKey);
  }

  private fetchVerifiedText(
    url: string,
    contentHash: string,
    cacheKey: string,
  ): Promise<string> {
    const cache = this.cache;
    const joined = cache.get(cacheKey);
    if (joined === undefined) {
      return this.issueFetch(url, contentHash, cacheKey);
    }
    this.ledger?.record(cache, cacheKey, joined);
    // A joined fetch that rejects is retried once from this load's own
    // URL: the issuer's eviction (registered first) has already removed
    // the rejected generation, so the retry publishes or joins a fresh one.
    return joined.catch(() => {
      const replacement = cache.get(cacheKey);
      if (replacement !== undefined) {
        this.ledger?.record(cache, cacheKey, replacement);
        return replacement;
      }
      return this.issueFetch(url, contentHash, cacheKey);
    });
  }

  private issueFetch(
    url: string,
    contentHash: string,
    cacheKey: string,
  ): Promise<string> {
    const cache = this.cache;
    const textPromise = this.fetchText(url).then(async (text) => {
      const actual = await SharedDepSha256.hex(text);
      if (actual !== contentHash) {
        throw new MfeLoadError(
          `shared-dep source '${url}' failed content-identity ` +
            `verification: expected ${contentHash}, got ${actual}.`,
          this.entryId,
        );
      }
      return text;
    });
    textPromise.catch(() => {
      if (cache.get(cacheKey) === textPromise) {
        cache.delete(cacheKey);
      }
    });
    cache.set(cacheKey, textPromise);
    this.ledger?.record(cache, cacheKey, textPromise);
    return textPromise;
  }
}
