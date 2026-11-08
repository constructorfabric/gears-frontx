/**
 * SHA-256 hex digest of fetched text — the content identity the
 * fetch-list contract verifies every fetched list document and chunk
 * against before it is used or admitted to the realm cache
 * (`cpt-frontx-algo-unit-format-contract-integrity-verification`).
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';

export class SharedDepSha256 {
  protected constructor() {}

  /** SHA-256 hex digest — the identity the list format declares. */
  static async hex(text: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) {
      throw new MfeLoadError(
        'SHA-256 verification requires crypto.subtle, which this realm ' +
          'does not provide.',
        'shared-dep',
      );
    }
    const digest = await subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text),
    );
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
