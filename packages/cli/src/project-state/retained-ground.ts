// The location history a MARKED template entry (`TemplateEntry.exclusionsBackfilled`)
// keeps in `TemplateEntry.relinquishedGround`.
//
// A mark says an old file may sit in ground the entry's declaration excluded
// since it was written. The file's LOCATION is what a later deletion needs, and
// the declaration that names it is overwritten by every upgrade: after an
// upgrade to `['sub/']` and one back to `[]`, the recorded declaration no longer
// names `sub/` anywhere, while the file is still on disk. So the roots are
// written onto the entry at the moment it is marked (and at every later write
// of a marked entry) from the declarations that changed (`changedDeclarations`),
// and only ever added to; `delete` and `register --replace` carry them, `unregister` drops them with the entry.
import { joinUnderTarget, withoutTrailingSlash } from '../paths/relative-path';
import type { TemplateEntry } from './types';

/** Project-relative directory roots (canonical, no trailing separator) of every declared exclusion beneath every target. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-protect-retained-ground
export function exclusionGroundRoots(targets: readonly string[], declarations: readonly string[]): string[] {
  const roots = new Set<string>();
  for (const target of targets) {
    for (const declared of declarations) roots.add(withoutTrailingSlash(joinUnderTarget(target, declared)));
  }
  return [...roots];
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-protect-retained-ground

/**
 * The declarations whose ground an upgrade or apply is NEWLY handing over (or
 * taking back), given what an UNMARKED entry recorded when its files were
 * written and what is declared now.
 *
 * An unmarked entry's recorded declaration is evidence of what its targets were
 * written under, so a region declared excluded both then and now was never the
 * entry's ground: a guest legitimately nested there is no old file of the
 * entry's, and the region is not retained merely because ANOTHER region changed.
 * What did change, a region added (the entry may have written there) or dropped
 * (an old guest-owned file may sit there), is returned.
 *
 * Without that evidence (`recorded` undefined: the entry is already marked, or
 * is a legacy entry with no value) nothing is proven and every declaration in
 * play is returned. The comparison is by exact spelling: a region spelled
 * differently on the two sides counts as changed, never as proven, so an
 * unreadable case or separator difference can only keep ground, not free it.
 */
export function changedDeclarations(recorded: readonly string[] | undefined, candidate: readonly string[]): string[] {
  const now = [...new Set(candidate.map(withoutTrailingSlash))];
  if (recorded === undefined) return now;
  const then = [...new Set(recorded.map(withoutTrailingSlash))];
  const common = then.filter((declared) => now.includes(declared));
  const insideProven = (declared: string): boolean =>
    common.some((root) => declared === root || declared.startsWith(`${root}/`));
  return [...then.filter((d) => !now.includes(d)), ...now.filter((d) => !then.includes(d))].filter((d) => !insideProven(d));
}

/** `true` when `declared` is one of `roots` or lies inside one (target-relative, by exact spelling). */
export function declarationCovered(declared: string, roots: readonly string[]): boolean {
  const normalized = withoutTrailingSlash(declared);
  return roots.some((root) => {
    const base = withoutTrailingSlash(root);
    return normalized === base || normalized.startsWith(`${base}/`);
  });
}

/**
 * The declarations BOTH lists exclude, the narrower region where one names a
 * subtree of the other: ground no write made under either list could have
 * reached. Exact spelling, so a region spelled differently on the two sides is
 * never proven (an unreadable case or separator difference can only drop
 * evidence, not invent it). Sorted and de-duplicated, spelled like a manifest declaration (trailing separator).
 */
export function intersectDeclarations(a: readonly string[], b: readonly string[]): string[] {
  const left = [...new Set(a.map(withoutTrailingSlash))];
  const right = [...new Set(b.map(withoutTrailingSlash))];
  return [
    ...new Set([...left.filter((x) => declarationCovered(x, right)), ...right.filter((y) => declarationCovered(y, left))]),
  ]
    .sort()
    .map((declared) => `${declared}/`);
}

/**
 * The durable evidence (`TemplateEntry.provenExcludedSubtrees`) a MARKED entry
 * carries once a write happens under `written`. Evidence only narrows: an entry
 * with none gets none, and one that has some keeps what `written` also
 * excludes. `undefined` when nothing remains (absent and empty mean the same).
 */
export function narrowedProvenExclusions(
  proven: readonly string[] | undefined,
  written: readonly string[],
): string[] | undefined {
  if (proven === undefined) return undefined;
  const kept = intersectDeclarations(proven, written);
  return kept.length > 0 ? kept : undefined;
}

/** `entry` with the evidence set (or removed when `proven` is `undefined`). */
export function withProvenExclusions(entry: TemplateEntry, proven: readonly string[] | undefined): TemplateEntry {
  const { provenExcludedSubtrees: _previous, ...rest } = entry;
  return proven !== undefined && proven.length > 0 ? { ...rest, provenExcludedSubtrees: [...proven] } : rest;
}

/** The union of two root lists, sorted and de-duplicated; `undefined` when both are empty. */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-protect-retained-ground
export function unionGroundRoots(...lists: ReadonlyArray<readonly string[] | undefined>): string[] | undefined {
  const merged = [...new Set(lists.flatMap((list) => list ?? []))].sort();
  return merged.length > 0 ? merged : undefined;
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-protect-retained-ground

/** `entry` with `roots` added to its `relinquishedGround` (unchanged when there is nothing to add). */
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-protect-retained-ground
export function withRetainedGround(entry: TemplateEntry, roots: readonly string[]): TemplateEntry {
  const merged = unionGroundRoots(entry.relinquishedGround, roots);
  return merged === undefined ? entry : { ...entry, relinquishedGround: merged };
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-protect-retained-ground
