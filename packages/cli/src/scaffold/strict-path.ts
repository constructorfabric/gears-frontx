// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// Types and pure helpers for `delete`'s protection of registered LOCAL origin
// folders: the strict (fail-closed) path classification port, the list of
// every registered local origin (current and previous, every entry), and the
// footprint guard for the owner's AI-bundle removal. The filesystem adapter
// (`adapters/fs-project-io.ts`) implements the ports; nothing here touches disk.
import { pathWithinTarget } from '../paths/relative-path';
import { parseLocalOrigin } from '../resolver/types';
import type { ProjectStateDocument } from '../project-state/types';
import type { CanonicalizeTargetFn } from './conflict-check';

export interface StrictPathEntry {
  /** Project-relative POSIX path of the entry, in the physical (resolved-prefix) space. */
  path: string;
  /** Whether the entry itself is a symbolic link. */
  symlink: boolean;
}
export type StrictPathClassification =
  | { kind: 'present' | 'absent'; canonical: string; entries: StrictPathEntry[] }
  | { kind: 'outside'; entries: StrictPathEntry[] }
  | { kind: 'unknown'; reason: string };
export type ClassifyPathStrictFn = (raw: string) => StrictPathClassification;
/** What stands at a project-relative path, without following a final symlink. */
export type EntryKindFn = (projectRelative: string) => 'absent' | 'symlink' | 'directory' | 'other' | { unknown: string };

/**
 * Classifier used when no strict port is injected (unit tests with fakes):
 * the lenient canonicalizer's answer, with a null (outside the project) as
 * `outside` and no traversal information.
 */
export function classifierFromCanonicalize(canonicalizeFn: CanonicalizeTargetFn): ClassifyPathStrictFn {
  return (raw) => {
    const canonical = canonicalizeFn(raw);
    return canonical === null ? { kind: 'outside', entries: [] } : { kind: 'present', canonical, entries: [] };
  };
}

/** Raw relative paths of every registered LOCAL origin, current and previous, owner included. */
export function registeredLocalOriginRaws(document: ProjectStateDocument): { name: string; origin: string; raw: string }[] {
  const out: { name: string; origin: string; raw: string }[] = [];
  const seen = new Set<string>();
  for (const [name, entry] of Object.entries(document.templates)) {
    for (const origin of [entry.origin, entry.previous?.origin]) {
      if (origin === undefined) continue;
      const raw = parseLocalOrigin(origin);
      if (raw === undefined) continue;
      const key = `${name}\0${origin}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, origin, raw });
    }
  }
  return out;
}

export type BundleFootprintVerdict =
  | { ok: true }
  | { ok: false; reason: string; bundlePath: string; origin?: string; name?: string };

/**
 * Whether removing the owner's AI bundle (`.frontx/ai/<owner>`, removed
 * recursively, a final symlink removed as a link) would destroy or break a
 * registered local origin. The REAL footprint is judged, not the lexical
 * name: the bundle's parent chain must resolve inside the real `.frontx/ai`
 * namespace (the adapter refuses otherwise, but only after side effects, so
 * it is refused here before any), the final entry is `lstat`ed, and a
 * registered origin conflicts when (a) its resolved location lies inside or
 * contains the removed footprint, or (b) its ACCESS PATH traverses a
 * directory entry that the removal deletes — which also catches an origin
 * reached through a bundle symlink or through a link inside the bundle,
 * whose bytes survive but whose stored path would stop working. Anything
 * undeterminable fails closed. Stable tree assumed.
 */
export function bundleFootprintVerdict(
  ownerName: string,
  origins: { name: string; origin: string; raw: string }[],
  classify: ClassifyPathStrictFn,
  entryKind: EntryKindFn,
): BundleFootprintVerdict {
  const nominal = `.frontx/ai/${ownerName}`;
  const parentRaw = nominal.split('/').slice(0, -1).join('/');
  const parent = classify(parentRaw);
  if (parent.kind === 'unknown') return { ok: false, reason: `parent-${parent.reason}`, bundlePath: nominal };
  if (parent.kind === 'absent') return { ok: true }; // no bundle to remove
  if (parent.kind === 'outside') return { ok: false, reason: 'parent-outside-project', bundlePath: nominal };
  const namespace = classify('.frontx/ai');
  if (namespace.kind === 'unknown') return { ok: false, reason: `namespace-${namespace.reason}`, bundlePath: nominal };
  if (namespace.kind !== 'present' || !pathWithinTarget(parent.canonical, namespace.canonical)) {
    return { ok: false, reason: 'outside-ai-namespace', bundlePath: nominal };
  }
  // Classify the full bundle path to find the physical stored name of the bundle entry.
  // Without this, an owner spelled 'strasse' may target the same directory as 'straße' but
  // footprint compares as distinct when the origin classifier records the physical name.
  const bundleFull = classify(nominal);
  if (bundleFull.kind === 'unknown') return { ok: false, reason: `bundle-${bundleFull.reason}`, bundlePath: nominal };
  if (bundleFull.kind === 'outside') return { ok: false, reason: 'bundle-outside-project', bundlePath: nominal };
  // For an absent result, the final entry may be a dangling symlink whose link file still
  // physically exists and will be removed by the adapter — treat it as the deletion footprint.
  // A genuinely absent entry or absent non-symlink entry has nothing to remove.
  const bundleEntry = bundleFull.entries[parent.entries.length];
  if (bundleFull.kind === 'absent') {
    if (bundleEntry === undefined || !bundleEntry.symlink) return { ok: true };
    // dangling symlink — fall through with the link entry as footprint
  }
  if (bundleEntry === undefined) return { ok: false, reason: 'bundle-entry-missing', bundlePath: nominal };
  const footprint = bundleEntry.path;
  const kind = entryKind(footprint);
  if (kind === 'absent') return { ok: true };
  if (typeof kind === 'object') return { ok: false, reason: `entry-${kind.unknown}`, bundlePath: footprint };
  const finalIsLink = bundleEntry.symlink;
  // NFC + unconditional case fold for all protection comparisons — both are authorized by human
  // ruling. The strict classifier records physical path names via inode-matched enumeration,
  // handling NFC/NFD, ß↔ss on APFS, and case folding at classification time. ciNorm remains as
  // a belt-and-suspenders fallback for absent paths (no inode to compare) and any FS equivalence
  // that inode matching cannot resolve (e.g., ambiguous hard links → fail closed).
  // Case folding is applied unconditionally, not via foldForIdentity's volume probe: a process
  // that probed a case-sensitive project root may be removing a bundle on a case-insensitive
  // mounted volume. Conservative refusal on NFC+lowercase equality is preferred.
  const ciNorm = (p: string) => p.normalize('NFC').toLowerCase();
  const ciFootprint = ciNorm(footprint);
  const nfcTouches = (p: string) => pathWithinTarget(ciNorm(p), ciFootprint);
  const nfcWithin = (a: string, b: string) => pathWithinTarget(ciNorm(a), ciNorm(b));
  const nfcEq = (a: string, b: string) => ciNorm(a) === ciNorm(b);
  for (const o of origins) {
    const c = classify(o.raw);
    if (c.kind === 'unknown') return { ok: false, reason: `origin-${c.reason}`, bundlePath: footprint, origin: o.origin, name: o.name };
    if (c.kind === 'present' || c.kind === 'absent') {
      // The removed footprint is the link entry alone when the final entry is a link.
      const resolvedConflict = finalIsLink ? nfcWithin(footprint, c.canonical) : nfcTouches(c.canonical) || nfcWithin(footprint, c.canonical);
      if (resolvedConflict) return { ok: false, reason: 'origin-overlaps-bundle', bundlePath: footprint, origin: o.origin, name: o.name };
    }
    if (c.entries.some((e) => (finalIsLink ? nfcEq(e.path, footprint) : nfcTouches(e.path)))) {
      return { ok: false, reason: 'origin-path-depends-on-removed-entry', bundlePath: footprint, origin: o.origin, name: o.name };
    }
  }
  return { ok: true };
}
