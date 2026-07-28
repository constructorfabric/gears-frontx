// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
import { BUNDLE_MARKER, readBundleFiles } from '../bundle/envelope';

// Narrowing an acquired multi-file bundle to the subtree a source-spec named
// (cpt-frontx-adr-source-spec-subdirectory-addressing). Selection is a filter
// over content the existing acquisition already produced, not a second
// transport, so it lives in the shared resolver rather than in any one fetch
// adapter.

export type NarrowSubtreeResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'no-bundle'; subtree: string; message: string }
  | { ok: false; reason: 'empty-subtree'; subtree: string; message: string }
  | { ok: false; reason: 'escaping-path'; subtree: string; path: string; message: string };

// Keep only the files under `subtree` and re-root every retained path so it is
// relative to the subtree rather than to the repository. Re-rooting is not
// cosmetic: downstream reads look the manifest up by its exact unprefixed
// filename, and the content store materializes every bundle key verbatim under
// the installed content path.
export function narrowBundleToSubtree(content: string, subtree: string): NarrowSubtreeResult {
  const files = readBundleFiles(content);
  if (files === undefined) {
    return {
      ok: false,
      reason: 'no-bundle',
      subtree,
      message: `Cannot select subtree "${subtree}": the acquired content is not a multi-file bundle, so nothing was installed.`,
    };
  }

  const prefix = `${subtree}/`;
  const narrowed: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    if (typeof text !== 'string') continue;
    if (!path.startsWith(prefix)) continue;
    const reRooted = path.slice(prefix.length);
    // A key equal to the prefix names the subtree itself, not a file under it.
    if (reRooted.length === 0) continue;

    // Re-rooting is what creates the escape, so the parser cannot have caught
    // it: `shell/../sibling/evil.txt` is inside the repository and becomes
    // `../sibling/evil.txt` once `shell/` is stripped. Refusing the whole
    // narrowing rather than dropping the key keeps the refusal visible instead
    // of installing a partial template.
    if (escapesSubtree(reRooted)) {
      return {
        ok: false,
        reason: 'escaping-path',
        subtree,
        path,
        message: `Subtree "${subtree}" carries "${path}", which resolves outside the subtree once re-rooted, so nothing was installed.`,
      };
    }

    narrowed[reRooted] = text;
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
function escapesSubtree(reRooted: string): boolean {
  if (reRooted.startsWith('/') || reRooted.includes('\\')) return true;
  return reRooted.split('/').some((segment) => segment === '..');
}
