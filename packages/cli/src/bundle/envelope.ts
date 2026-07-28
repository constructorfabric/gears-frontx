// The multi-file bundle envelope every fetch adapter returns and every core
// reader consumes: `{ "$frontxTemplateFiles": { <relative path>: <file text> } }`.
//
// Core owns this shape here so that every module on both sides of it — the
// `adapters/` that produce an envelope and the `manifest/` and `resolver/`
// modules that read one — names the marker once. The readers must not reach
// into the IO layer for it, and each side previously carried its own copy.
// The two parses stay separate on purpose: the producing side additionally
// rejects an empty map and non-string values, a stricter rule than a reader
// needs.
export const BUNDLE_MARKER = '$frontxTemplateFiles';

// The file map inside the envelope, or `undefined` when `content` is not an
// envelope at all — the resolver seam also admits a bare manifest string, and
// callers must be able to tell the two apart rather than treat a missing map
// as an empty one.
export function readBundleFiles(content: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;

  const filesValue = (parsed as Record<string, unknown>)[BUNDLE_MARKER];
  if (typeof filesValue !== 'object' || filesValue === null || Array.isArray(filesValue)) {
    return undefined;
  }
  return filesValue as Record<string, unknown>;
}
