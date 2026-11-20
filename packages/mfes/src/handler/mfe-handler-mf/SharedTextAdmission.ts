/**
 * Shared-text admission: the realm-cache discipline every shared file the
 * package fetches goes through (`cpt-frontx-algo-unit-format-contract-shared-text-admission`).
 * The realm cache key is derived from the content identity the file
 * declares; text is admitted as fetched, never compared against anything,
 * and the declared identity is only the sharing key.
 *
 * A rejected fetch is evicted only while the cache still holds THIS promise
 * (generation identity), so a replacement another load or copy published
 * under the same key is never removed. When an attempt ledger is supplied,
 * every joined or issued entry is recorded so an abandoned attempt can
 * release exactly what it waited on. A load that joined another load's
 * in-flight fetch and sees it reject retries once from its own URL.
 *
 * The keys are an internal protocol between copies of the package; no
 * public operation takes or exposes one.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import type { AttemptSourceTextLedger } from './AttemptSourceTextLedger';
import type { SharedDepTextCache } from './RealmSharedDepTextCacheProvider';

export class SharedTextAdmission {
  // @cpt-begin:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-derive-key
  /** Realm cache key of a list unit. */
  static chunkKey(contentHash: string): string {
    return `chunk:${contentHash}`;
  }

  /**
   * Realm cache key of a whole-package entry: its declared `contentHash`,
   * or its absolute URL when it declares none.
   */
  static wholePackageKey(
    name: string,
    version: string,
    contentHashOrUrl: string,
  ): string {
    return `${name}@${version}@${contentHashOrUrl}`;
  }
  // @cpt-end:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-derive-key

  constructor(
    private readonly cache: SharedDepTextCache,
    private readonly ledger?: AttemptSourceTextLedger,
  ) {}

  /**
   * Admit the text of `url` to the realm cache under `key`, as fetched:
   * answer from a resident or in-flight entry, otherwise request it
   * through `fetchText` and publish the in-flight promise before it settles.
   */
  admit(
    key: string,
    url: string,
    fetchText: (url: string) => Promise<string>,
  ): Promise<string> {
    const cache = this.cache;
    // @cpt-begin:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-reuse-resident
    // @cpt-begin:cpt-frontx-flow-unit-format-contract-host-admission:p1:inst-host-concurrent-join
    const joined = cache.get(key);
    // @cpt-end:cpt-frontx-flow-unit-format-contract-host-admission:p1:inst-host-concurrent-join
    if (joined === undefined) {
      return this.issueFetch(key, url, fetchText);
    }
    this.ledger?.record(cache, key, joined);
    // @cpt-end:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-reuse-resident
    // @cpt-begin:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-join-retry-once
    // @cpt-begin:cpt-frontx-flow-unit-format-contract-host-admission:p1:inst-host-concurrent-join
    // A joined fetch that rejects is retried once from this load's own
    // URL: the issuer's eviction (registered first) has already removed
    // the rejected generation, so the retry publishes or joins a fresh one.
    // A load that has already failed retries nothing.
    return joined.catch((error: unknown) => {
      if (this.ledger?.hasFailed === true) throw error;
      const replacement = cache.get(key);
      if (replacement !== undefined) {
        this.ledger?.record(cache, key, replacement);
        return replacement;
      }
      return this.issueFetch(key, url, fetchText);
    });
    // @cpt-end:cpt-frontx-flow-unit-format-contract-host-admission:p1:inst-host-concurrent-join
    // @cpt-end:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-join-retry-once
  }

  private issueFetch(
    key: string,
    url: string,
    fetchText: (url: string) => Promise<string>,
  ): Promise<string> {
    const cache = this.cache;
    // @cpt-begin:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-fetch-on-miss
    // A load that has already failed publishes no further in-flight entry.
    if (this.ledger?.hasFailed === true) {
      return Promise.reject(
        new Error(`load already failed: '${url}' is not requested`),
      );
    }
    // Published under the key before it settles, so a concurrent caller
    // from ANY compatible copy computing the same key joins it.
    const textPromise = fetchText(url);
    // @cpt-begin:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-evict-on-reject
    textPromise.catch(() => {
      if (cache.get(key) === textPromise) {
        cache.delete(key);
      }
    });
    // @cpt-end:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-evict-on-reject
    cache.set(key, textPromise);
    // @cpt-end:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-fetch-on-miss
    // @cpt-begin:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-admit-as-fetched
    // The text is returned as fetched and held under the key the declared
    // identity fixes; nothing is compared against it and the handler's
    // URL-keyed source-text cache never sees it.
    this.ledger?.record(cache, key, textPromise);
    return textPromise;
    // @cpt-end:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-admit-as-fetched
  }
}
