import type { SharedDepTextCache } from './RealmSharedDepTextCacheProvider';

/**
 * One load attempt's record of the source-text cache entries it is waiting
 * on, so the attempt's abandonment on timeout can release them.
 *
 * `MfeHandlerMF.fetchSourceText` publishes its in-flight fetch promise in
 * the handler-level, URL-keyed `sourceTextCache` (a copy-local `LruCache`),
 * and `fetchSharedDepSources` does the same in the two-tier-keyed
 * `sharedDepTextCache` — a reference to the REALM-SHARED
 * cache `RealmSharedDepTextCacheProvider.getCache()` returns (or, if that copy fell back,
 * a cache local to this copy — see `RealmSharedDepTextCacheProvider.ts`). Either
 * way the entry is evicted only when the promise it names REJECTS. A fetch
 * that never settles is therefore never evicted, so the retry that follows
 * a timeout rejoins the very promise the timed-out attempt already gave up
 * on and expires against its own budget in turn — the timeout bounds the
 * hang without ever recovering from it.
 *
 * Every attempt gets its own ledger (created per invocation of the retry
 * callback in {@link MfeHandlerMF.load}). Each cache entry the attempt
 * registers OR joins is recorded here — the ACTUAL cache object it used
 * (`inst-lto-release-record-cache`), never a name to be re-resolved when
 * the release runs, because a shared-dependency entry may live in the
 * realm-shared cache OR in this copy's local fallback, and only the cache
 * that received the exact promise is the one to release it from. Recording
 * the promise itself (not merely the cache and key) is what makes the
 * release identity-checked against a specific GENERATION
 * (`inst-lto-release-generation-identity`): if two copies both joined
 * promise P1 and one copy's attempt times out and deletes P1's mapping, a
 * retry may publish a replacement P2 under the same key — the other copy's
 * later release still carries P1, so its identity check fails against P2
 * and it cannot remove it. On timeout {@link release} removes exactly the
 * still-unsettled entries this attempt actually joined, so the next attempt
 * issues its own fetch. A blunt "clear the cache" would instead discard
 * entries other, still-live loads — in this copy or, for the realm-shared
 * cache, in another compatible copy — are legitimately waiting on.
 */
export class AttemptSourceTextLedger {
  private readonly entries: Array<{
    readonly cache: SharedDepTextCache;
    readonly key: string;
    readonly promise: Promise<string>;
    settled: boolean;
  }> = [];

  private released = false;

  /**
   * Record that this attempt is waiting on `promise` under `key` in
   * `cache`. Entries that settle before {@link release} are marked and
   * skipped there: a settled entry is not one the attempt is still
   * waiting on, and dropping it would only cost the cache a legitimate
   * hit. Recording stops once the ledger is released — anything the
   * abandoned attempt's background work registers afterwards belongs to
   * that work, not to a retry this ledger can still speak for.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-record-cache
  record(
    cache: SharedDepTextCache,
    key: string,
    promise: Promise<string>
  ): void {
    if (this.released) {
      return;
    }
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-generation-identity
    // Recording the promise itself — not merely the cache and key — is
    // what lets `release()` below distinguish the GENERATION this attempt
    // actually joined from a later replacement generation published under
    // the same key.
    const entry = { cache, key, promise, settled: false };
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-generation-identity
    const markSettled = (): void => {
      entry.settled = true;
    };
    promise.then(markSettled, markSettled);
    this.entries.push(entry);
  }
  // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-record-cache

  /**
   * Release the still-unsettled cache entries this attempt was waiting on.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-abandoned-source-text
  release(): void {
    this.released = true;
    for (const entry of this.entries) {
      if (entry.settled) {
        continue;
      }
      // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-identity-checked
      // Identity-checked, exactly as the eviction-on-rejection in
      // `fetchSourceText` and `fetchSharedDepSources` is: remove the key
      // only while it still maps to the very promise this attempt was
      // waiting on, never one a concurrent load has since registered
      // under the same key — the discipline that makes a release from one
      // copy safe against a realm-shared cache another copy is also
      // publishing into.
      // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-generation-identity
      // Where two copies both joined this same promise and one already
      // timed out and deleted this mapping, a retry may have since
      // published a REPLACEMENT promise under `entry.key`. This check
      // fails against that replacement (it is not `entry.promise`), so
      // this release can never evict a generation this attempt did not
      // join — only an attempt that actually joined the replacement, and
      // then exhausted its own budget, may release it.
      if (entry.cache.get(entry.key) === entry.promise) {
        entry.cache.delete(entry.key);
      }
      // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-generation-identity
      // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-identity-checked
    }
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-not-cancel
    // Releasing an entry is NOT cancelling the work behind it: no
    // `AbortController` is signalled here and none exists in this file, so
    // the abandoned fetch runs to completion (`inst-lto-no-cancel` holds
    // unchanged) — only the cache mapping goes, so the retry cannot
    // resolve to it. The accepted cost is that the abandoned fetch and the
    // retry's own fetch may be in flight for the same source at once, the
    // price of a retry that can actually succeed.
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-realm-shared
    // Where the released entry lived in the realm-shared cache, this
    // release may reach a key another independently loaded copy is
    // awaiting. That waiter is undisturbed — it already holds the promise,
    // and this removed only the mapping to it — while a caller arriving
    // after this release finds no entry and starts a duplicate fetch. That
    // duplicate arises across genuine retry generations (the intended
    // recovery when a fetch exceeds an attempt budget), never merely from
    // the number of copies that originally joined one promise, which
    // `inst-lto-release-generation-identity` above bounds. No waiter count
    // is recorded anywhere in this release path: conditioning release on
    // "no other waiter" would leave a timed-out attempt's own retry
    // rejoining the same possibly-hung promise forever, since a staggered
    // retry could hold such a count above zero indefinitely.
    this.entries.length = 0;
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-realm-shared
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-not-cancel
  }
  // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-abandoned-source-text
}
