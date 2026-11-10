// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
import { BUNDLE_MARKER, readBundleFiles, isBinaryBundleValue, decodeBundleValue, BinaryBundleValue } from '../bundle/envelope';
import { setOwn } from '../own-record';

// Narrowing an acquired multi-file bundle to the subtree a source-spec named
// (cpt-frontx-adr-source-spec-syntax). Selection is a filter
// over content the existing acquisition already produced, not a second
// transport, so it lives in the shared resolver rather than in any one fetch
// adapter.

export type NarrowSubtreeResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'no-bundle'; subtree: string; message: string }
  | { ok: false; reason: 'empty-subtree'; subtree: string; message: string }
  | { ok: false; reason: 'escaping-path'; subtree: string; path: string; message: string }
  | { ok: false; reason: 'invalid-entry'; subtree: string; path: string; message: string };

// Keep only the files under `subtree` and re-root every retained path so it is
// relative to the subtree rather than to the repository. Re-rooting is not
// cosmetic: downstream reads look the manifest up by its exact unprefixed
// filename, and the content store materializes every bundle key verbatim under
// the installed content path.
export function narrowBundleToSubtree(content: string, subtree: string): NarrowSubtreeResult {
  const files = readBundleFiles(content);
  if (files == null) {
    // undefined = no marker; null = marker present but invalid value.
    // Both mean the content is not a usable multi-file bundle.
    return {
      ok: false,
      reason: 'no-bundle',
      subtree,
      message: `Cannot select subtree "${subtree}": the acquired content is not a multi-file bundle, so nothing was installed.`,
    };
  }

  const prefix = `${subtree}/`;
  // Collect the candidate set before any validation so escape priority is
  // global — independent of entry iteration order and of whether a later
  // entry has an invalid value.
  const candidates: Array<{ path: string; reRooted: string; value: unknown }> = [];
  for (const [path, value] of Object.entries(files)) {
    if (!path.startsWith(prefix)) continue;
    const reRooted = path.slice(prefix.length);
    // A key equal to the prefix names the subtree itself, not a file under it.
    if (reRooted.length === 0) continue;
    candidates.push({ path, reRooted, value });
  }

  // Pass 1: escape check over the whole selected set.
  // Re-rooting is what creates the escape, so the parser cannot have caught
  // it: `shell/../sibling/evil.txt` is inside the repository and becomes
  // `../sibling/evil.txt` once `shell/` is stripped. Refusing the whole
  // narrowing rather than dropping the key keeps the refusal visible instead
  // of installing a partial template. Run on ALL candidates regardless of
  // value type — an escaping path is dangerous whether its content is
  // readable. Escape wins over value errors across the whole set, not just
  // per-entry.
  for (const { path, reRooted } of candidates) {
    if (escapesSubtree(reRooted)) {
      return {
        ok: false,
        reason: 'escaping-path',
        subtree,
        path,
        message: `Subtree "${subtree}" carries "${path}", which resolves outside the subtree once re-rooted, so nothing was installed.`,
      };
    }
  }

  // Pass 2: value validation.
  const narrowed: Record<string, string | BinaryBundleValue> = {};
  for (const { path, reRooted, value } of candidates) {
    if (typeof value !== 'string' && !isBinaryBundleValue(value)) {
      return {
        ok: false,
        reason: 'invalid-entry',
        subtree,
        path,
        message: `Subtree "${subtree}" entry "${path}" has an unrecognised value type, so nothing was installed.`,
      };
    }
    if (isBinaryBundleValue(value) && decodeBundleValue(value) === null) {
      return {
        ok: false,
        reason: 'invalid-entry',
        subtree,
        path,
        message: `Subtree "${subtree}" entry "${path}" contains non-canonical base64, so nothing was installed.`,
      };
    }
    setOwn(narrowed, reRooted, value);
  }

  if (Object.keys(narrowed).length === 0) {
    return {
      ok: false,
      reason: 'empty-subtree',
      subtree,
      message: `Subtree "${subtree}" holds no content at this version, so nothing was installed.`,
    };
  }

  return { ok: true, content: JSON.stringify({ [BUNDLE_MARKER]: narrowed }) };
}

// A re-rooted path escapes when it is absolute, carries a backslash, or climbs
// above its own root. Any `..` segment is refused rather than resolved, so a
// path that climbs and comes back (`a/../b`) is refused too: it has no
// legitimate use in a bundle.
//
// This is deliberately only the escape that RE-ROOTING creates — the verdict
// this step reports as its own (`inst-resolve-subtree-empty-fail`) — and a strict
// subset of `isSafeRelativePath`, not a second shape rule: every re-rooted key
// it lets through is judged by the full rule, in the same resolution, by
// `findInvalidBundleKey` (`inst-resolve-bundle-keys`), which also reports the
// rule that applies (a colon, surrounding whitespace) rather than an escape.
function escapesSubtree(reRooted: string): boolean {
  if (reRooted.startsWith('/') || reRooted.includes('\\')) return true;
  return reRooted.split('/').some((segment) => segment === '..');
}
