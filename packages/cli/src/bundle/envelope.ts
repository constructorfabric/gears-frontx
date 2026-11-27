import { unsafeRelativePathReason } from '../paths/relative-path';
import { foldForIdentity } from '../paths/volume-case';

// Binary-safe bundle value: a base64-encoded file payload. All newly acquired
// files (remote fetch, local store read) are encoded as this shape; plain
// string entries are accepted on read for backward compatibility only.
export interface BinaryBundleValue {
  encoding: 'base64';
  data: string; // canonical base64 (re-encode round-trip must match)
}

export function isBinaryBundleValue(v: unknown): v is BinaryBundleValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    // Exact field set: exactly {encoding, data} — no extra fields permitted.
    Object.keys(v as object).length === 2 &&
    (v as Record<string, unknown>).encoding === 'base64' &&
    typeof (v as Record<string, unknown>).data === 'string'
  );
}

export function encodeBundleValue(buf: Buffer): BinaryBundleValue {
  return { encoding: 'base64', data: buf.toString('base64') };
}

// Returns null for non-canonical base64 (round-trip validation required by r4 §1).
// Empty file (data === '') is valid.
export function decodeBundleValue(v: BinaryBundleValue): Buffer | null {
  const decoded = Buffer.from(v.data, 'base64');
  return decoded.toString('base64') === v.data ? decoded : null;
}

// The multi-file bundle envelope every fetch adapter returns and every core
// reader consumes: `{ "$frontxTemplateFiles": { <relative path>: <file text> } }`.
//
// Core owns this shape here so that every module on both sides of it — the
// `adapters/` that produce or materialize an envelope and the `manifest/` and
// `resolver/` modules that read one — names and decodes the marker once. A
// consumer that needs a stricter value type refines the decoded map without
// parsing the envelope again.
//
// A key is a relative path with POSIX separators on every host, because the
// envelope is a wire format rather than a host path: the GitHub adapter takes
// its keys from tar entries, and subtree narrowing matches a `<subtree>/`
// prefix and refuses a backslash as an escaping path
// (packages/cli/src/resolver/narrow-subtree.ts). An adapter that builds a key
// with `path.join` breaks both on Windows.
export const BUNDLE_MARKER = '$frontxTemplateFiles';

// The first key of a file map (`Object.keys` of the envelope's map, or the file
// names a template directory lists) that cannot be written as it stands, with the
// reason, or `undefined` when the keys are a sound set of template-relative
// paths. The key is a name the PUBLISHER of the template chose — a tar entry
// name, once a tarball is unpacked — and every consumer of the map joins it
// under a root of its own: the inventory content store under an installed
// content path, an upgrade under a target. Two things can go wrong with that
// join, and both are decided here, once, ahead of every consumer:
//
//   - A key that is not a safe template-relative path — absolute, climbing with
//     `..`, spelling a separator as a backslash, naming a drive — makes the join
//     land somewhere the consumer never meant. Two of those joins
//     (`../../index.json` under the content path, `../other/x.txt` under a
//     target) land inside the root the consumer's own containment check guards,
//     so that check cannot be what refuses them. It is the same
//     `isSafeRelativePath` rule the manifest contract and the source-spec parser
//     already answer to, not a second one.
//   - Keys that are individually fine but cannot all be written: one that is a
//     directory of another (`src` and `src/index.ts`) leaves a consumer to fail
//     half way through with a raw filesystem error and a half-written slot, and
//     two that name the same location once case and Unicode normalisation are
//     folded (`README.md` and `readme.md`, a precomposed and a decomposed `é`)
//     collapse into one file, the later silently replacing the earlier — which
//     for `frontx-template.json` means the manifest at rest is not the manifest
//     the identity was read from. Case folds through `foldForIdentity`, the one
//     fold every path comparison in this package runs through, so it follows
//     the volume the keys will be written to.
//
// Every key is judged, whatever its value: a consumer that skips a non-string
// value still has not made its key safe. Per-key checks run over the whole map
// before the set checks, so a key's own fault is reported ahead of any
// collision it also takes part in.
export interface InvalidBundleKey {
  key: string;
  // Completes "carries the file <key>, which ..." — names the actual rule, and
  // reads as a clause a semicolon can follow.
  reason: string;
}

export class InvalidBundleKeyError extends Error {
  constructor(
    readonly key: string,
    readonly reason: string,
  ) {
    super(`Template bundle carries the file ${JSON.stringify(key)}, which ${reason}; the template was refused.`);
    this.name = 'InvalidBundleKeyError';
  }
}

export function findInvalidBundleKey(keys: readonly string[]): InvalidBundleKey | undefined {
  for (const key of keys) {
    const why = unsafeRelativePathReason(key);
    if (why !== undefined) {
      return { key, reason: `is not a safe template-relative path: it ${why}` };
    }
  }

  const identityOf = (key: string): string => foldForIdentity(key.normalize('NFC'));
  const byIdentity = new Map<string, string>();
  for (const key of keys) {
    const identity = identityOf(key);
    const earlier = byIdentity.get(identity);
    if (earlier !== undefined) {
      return {
        key,
        reason:
          `names the same location as ${JSON.stringify(earlier)} (the two differ only in letter case or ` +
          'Unicode normalisation), so one would silently replace the other',
      };
    }
    byIdentity.set(identity, key);
  }

  for (const key of keys) {
    const segments = identityOf(key).split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      const directoryOf = byIdentity.get(segments.slice(0, depth).join('/'));
      if (directoryOf !== undefined) {
        return {
          key: directoryOf,
          reason: `is also a directory of ${JSON.stringify(key)}, so both cannot be written`,
        };
      }
    }
  }
  return undefined;
}

// Three-state file map reader:
//   undefined — BUNDLE_MARKER is absent as an own property (bare manifest or
//               non-JSON — the resolver seam also admits bare strings, and
//               callers must distinguish "no marker" from "invalid marker")
//   null      — BUNDLE_MARKER is present as an own property but its value is
//               not a plain object map (null, array, number, string, …); the
//               envelope is recognised as an attempt but structurally invalid
//   Record    — BUNDLE_MARKER is present and its value is a plain object map
//               (possibly empty — consumers decide whether empty is valid)
//
// Using Object.hasOwn for the own-property check prevents prototype-injected
// marker keys from being mistaken for a real envelope.
export function readBundleFiles(content: string): Record<string, unknown> | null | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;

  const obj = parsed as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(obj, BUNDLE_MARKER)) return undefined;

  const filesValue = obj[BUNDLE_MARKER];
  if (typeof filesValue !== 'object' || filesValue === null || Array.isArray(filesValue)) {
    return null; // marker present but its value is not a plain object map
  }
  return filesValue as Record<string, unknown>;
}
