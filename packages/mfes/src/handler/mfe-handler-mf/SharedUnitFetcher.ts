/**
 * Shared list-item text fetcher: the host-facing way to put a list item's
 * text into the realm cache, so a microfrontend load that needs the same
 * item reuses it (`cpt-frontx-algo-unit-format-contract-loader-surface`).
 *
 * The fetcher derives the `chunk:<contentHash>` key itself and admits the
 * text as fetched through `SharedTextAdmission`, against the realm cache
 * `RealmSharedDepTextCacheProvider.getCache()` returns. It takes no cache,
 * no key and no attempt record.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 */

import { MfeLoadError } from '../../errors';
import { RealmSharedDepTextCacheProvider } from './RealmSharedDepTextCacheProvider';
import { SharedTextAdmission } from './SharedTextAdmission';

export class SharedUnitFetcher {
  private readonly admission: SharedTextAdmission;

  /**
   * @param fetchFn - turns a URL into a promise of its text
   * @param label - carried by the errors this fetcher raises
   */
  constructor(
    private readonly fetchFn: (url: string) => Promise<string>,
    private readonly label: string,
  ) {
    this.admission = new SharedTextAdmission(
      RealmSharedDepTextCacheProvider.getCache(),
    );
  }

  /**
   * Fetch the list item at `url` and admit its text to the realm cache
   * under `chunk:<contentHash>`; a rejected fetch is evicted and rejects
   * with an `MfeLoadError` carrying the label and naming the file, the
   * original error kept as its cause.
   */
  async fetch(url: string, contentHash: string): Promise<string> {
    try {
      return await this.admission.admit(
        SharedTextAdmission.chunkKey(contentHash),
        url,
        this.fetchFn,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new MfeLoadError(
        `shared unit '${url}' could not be fetched: ${reason}`,
        this.label,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
