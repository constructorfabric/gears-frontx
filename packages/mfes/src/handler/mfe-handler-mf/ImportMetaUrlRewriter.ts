/**
 * Replacement of `import.meta.url` in text minted into a blob.
 *
 * A blob-evaluated module's `import.meta.url` is a `blob:` URL, which has no
 * directory component and breaks `new URL("../path", import.meta.url)`. The
 * mint replaces every `import.meta.url` token sequence — found by the
 * tokenizing `DynamicImportScan`, so one inside a string or comment is never
 * touched and `import.meta.env` or `import.meta.urlx` stays intact — with
 * the file's resolved location as a string literal. That is what
 * `import.meta.url` means for the file, so a relative URL resolved against
 * it lands where it would for the unpacked file. It is applied to an own
 * chunk, a list unit and a whole-package entry alike, and only to the text
 * that becomes the blob: a unit's cached bytes stay unchanged
 * (`cpt-frontx-algo-mfe-isolation-blob-url-chain`, `inst-rewrite-meta-url`).
 *
 * One class per file (`runtime_style`); every member is static.
 *
 * @packageDocumentation
 * @internal
 */

import type { ImportMetaUrlRecord } from '../../unit-format/dynamic-import-scan';
import type { SourceEdit } from './SourceSplice';

export class ImportMetaUrlRewriter {
  protected constructor() {}

  /**
   * The edits that replace each recorded `import.meta.url` with
   * `resolvedUrl`, JSON-quoted so the URL's special characters are escaped.
   */
  static edits(
    records: readonly ImportMetaUrlRecord[],
    resolvedUrl: string,
  ): SourceEdit[] {
    const literal = JSON.stringify(resolvedUrl);
    return records.map((record) => ({
      start: record.start,
      end: record.end,
      text: literal,
    }));
  }
}
