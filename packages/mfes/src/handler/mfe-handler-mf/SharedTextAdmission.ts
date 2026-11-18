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
  /** Realm cache key of a fetch-list document. */
  static listKey(contentHash: string): string {
    return `list:${contentHash}`;
  }

  /** Realm cache key of a list item. */
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
    const joined = cache.get(key);
    if (joined === undefined) {
      return this.issueFetch(key, url, fetchText);
    }
    this.ledger?.record(cache, key, joined);
    // A joined fetch that rejects is retried once from this load's own
    // URL: the issuer's eviction (registered first) has already removed
    // the rejected generation, so the retry publishes or joins a fresh one.
    return joined.catch(() => {
      const replacement = cache.get(key);
      if (replacement !== undefined) {
        this.ledger?.record(cache, key, replacement);
        return replacement;
      }
      return this.issueFetch(key, url, fetchText);
    });
  }

  private issueFetch(
    key: string,
    url: string,
    fetchText: (url: string) => Promise<string>,
  ): Promise<string> {
    const cache = this.cache;
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
    this.ledger?.record(cache, key, textPromise);
    return textPromise;
  }
}
