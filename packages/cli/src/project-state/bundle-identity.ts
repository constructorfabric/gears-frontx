// A template's AI-extension bundle is materialized at `.frontx/ai/<name>/`
// (`adapters/fs-ai-bundle.ts`), so the template NAME is a path there — a scoped
// `@x/a` and `@x/a/b` occupy nested directories, and two names differing only
// in case occupy one directory on a case-insensitive volume. The bundle step
// clears and removes that directory recursively and BY NAME, whether or not
// the template itself ships a bundle, so a parent name's refresh, removal, or
// delete takes the nested name's materialized bundle with it while the nested
// template stays registered and applied (cross-template data loss).
//
// This is the project-side counterpart of the inventory's identity-nesting
// refusal (`inventory/TemplateInventory.ts`): the SAME predicate (`pathsNest`,
// ground identity through `foldForIdentity`), over the names registered in the
// project state document. It decides nothing about case policy — it compares
// by the existing filesystem identity contract, whatever that contract says
// for the volume the project lives on.
import { pathsNest } from '../paths/relative-path';
import type { TemplateEntry } from './types';

/** Registered names (other than `name` itself) whose bundle directory equals,
 * contains, or is contained by `name`'s — i.e. names that cannot be
 * registered next to `name` without one's bundle operations reaching the
 * other's ground. Sorted, so a refusal is deterministic. */
// @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap
export function overlappingBundleNames(templates: Readonly<Record<string, TemplateEntry>>, name: string): string[] {
  return Object.keys(templates)
    .filter((other) => other !== name && pathsNest(other.normalize("NFC"), name.normalize("NFC")))
    .sort();
}
// @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap

/** Registered names a bundle operation on `name` could damage, or that could
 * damage `name`'s bundle, judged over the PROSPECTIVE state: another
 * registered name whose bundle directory equals, contains, or lies inside
 * `name`'s AND which either has applied targets (its bundle is materialized
 * while it has one) or is in `scheduled` (the names the same batch is about
 * to materialize — `scheduled` names count whether or not they carry a bundle
 * or any recorded target, because the batch writes them one after another).
 *
 * The check is SYMMETRIC. Clearing a directory takes everything inside it, so
 * a name nested INSIDE `name`'s directory loses its bundle when `name`'s is
 * refreshed or removed; and a name CONTAINING `name`'s directory may itself
 * hold files at that nested path (a bundle's keys may be nested: `@x/a`
 * shipping `b/parent.md` puts bytes in `.frontx/ai/@x/a/b/`, which is
 * `@x/a/b`'s directory), so clearing the nested name's directory destroys
 * those ancestor bytes. Which files an ancestor holds there is decided by its
 * source bundle, not by the names, so the names alone cannot prove the
 * ancestor safe and no direction is exempt. */
// @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap
export function bundleConflictsOf(
  templates: Readonly<Record<string, TemplateEntry>>,
  name: string,
  scheduled: Iterable<string> = [],
): string[] {
  const scheduledNames = new Set(scheduled);
  return Object.entries(templates)
    .filter(([other, entry]) => {
      if (other === name) return false;
      if (entry.targets.length === 0 && !scheduledNames.has(other)) return false;
      return pathsNest(other.normalize("NFC"), name.normalize("NFC"));
    })
    .map(([other]) => other)
    .sort();
}
// @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap

/** Every registered pair whose bundle identities overlap, each pair once. */
// @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap
export function overlappingBundlePairs(templates: Readonly<Record<string, TemplateEntry>>): Array<[string, string]> {
  const names = Object.keys(templates).sort();
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      if (pathsNest(names[i]!.normalize("NFC"), names[j]!.normalize("NFC"))) pairs.push([names[i]!, names[j]!]);
    }
  }
  return pairs;
}
// @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap

/** The refusal text shared by every command that stops on an overlap. The
 * conflicting name may have no bundle at all (the bundle step acts by name),
 * so the text says what COULD be cleared rather than what is. */
// @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-bundle-overlap
export function bundleOverlapMessage(name: string, others: readonly string[], action: string): string {
  return (
    `${action}: the AI-bundle directory of "${name}" (.frontx/ai/${name}) overlaps the template(s) ` +
    `${others.map((o) => `"${o}"`).join(', ')}. A bundle refresh or removal acts on that directory by name and ` +
    "recursively, so it could clear bytes the other template has materialized there. Nothing was changed."
  );
}
// @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-bundle-overlap
