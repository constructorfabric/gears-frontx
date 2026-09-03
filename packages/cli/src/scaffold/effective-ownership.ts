// The six-term subtraction that fixes a template's effective ownership at
// one target — the ONE shared formulation two algorithms cite by name
// rather than restate: `cpt-frontx-algo-cli-scaffolding-uniform-apply`'s own
// `inst-ua-compute-ownership` step ("the target minus `excludedSubtrees`
// minus `projectOwnedRoots` minus `.frontx` minus the reserved environment
// entries... minus the template's own local origin folder") and
// `cpt-frontx-algo-cli-scaffolding-delete-plan`'s `inst-dp-compute-ownership`
// step, whose own text says explicitly "the same six-term subtraction the
// apply path computes". A target's effective ownership is never computed a
// second, independently-formulated way by either caller.
//
// Every term lives in PROJECT-RELATIVE space, never target-relative: a
// manifest's declared `excludedSubtrees` entries are the one term authored
// relative to the template's own target (`manifest/types.ts`'s own doc
// comment on the field), so they are the one term this module re-roots
// under `target` before comparing: exactly the join `ownership.ts`'s
// `buildRecordedTargets` already performs for the SAME reason
// (`conflict-check.ts`'s own `TargetClaim` doc comment). `.frontx`, the
// reserved environment entries, `projectOwnedRoots`, and a local origin
// folder are already project-relative as recorded, so they need no
// re-rooting at all — each is simply a candidate exclusion root, included
// unconditionally; `pathWithinTarget` answers false on its own for any
// root that does not actually sit beneath `target`, so no term needs a
// "is this beneath target" pre-filter before being added to the list.
//
// `target` may legitimately be `.`, the project root
// (`cpt-frontx-algo-cli-scaffolding-delete-plan`'s own text uses exactly
// this example) — `pathWithinTarget`, not the bare `pathWithinSubtree`, is
// what recognizes root as containing everything (`paths/relative-path.ts`'s
// own doc comment on why the two are distinct). The re-rooting join below
// has its own root case: `${target}/${declared}` would spell `./docs/`
// when `target` is `.`, a form `pathWithinSubtree` does not recognize as
// equal to the plain `docs/` a real payload path resolves to —
// `joinUnderTarget` (`../paths/relative-path.ts`) is the one shared place
// that decides how a declaration is re-rooted, so this module and every
// other caller never have to agree on that spelling twice.
import { pathWithinTarget, joinUnderTarget } from '../paths/relative-path';
import { RESERVED_ENVIRONMENT_ENTRIES } from '../manifest/validate-contract';

// Same spelling as `scaffold/conflict-check.ts`'s own `FRONTX_NAMESPACE_ROOT`
// — restated rather than imported because neither module exports it as a
// shared named constant today; both are the CLI's one reserved-namespace
// literal, not two independently-chosen spellings.
const FRONTX_NAMESPACE_ROOT = '.frontx';

export interface EffectiveOwnershipTerms {
  target: string;
  excludedSubtrees: string[];
  projectOwnedRoots: string[];
  // The template's own local origin folder, project-relative, when it was
  // installed via a local `path:` origin — absent for a remote origin,
  // which has no folder inside the project to exclude.
  localOriginFolder?: string;
}

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-compute-ownership
// @cpt-begin:cpt-frontx-algo-cli-scaffolding-delete-plan:p1:inst-dp-compute-ownership
/**
 * The full list of project-relative exclusion roots the six-term
 * subtraction names, for one target. A candidate path is within the
 * target's effective ownership iff it is within `target` itself and
 * within none of these roots (`isWithinEffectiveOwnership`, below).
 */
export function computeExclusionRoots(terms: EffectiveOwnershipTerms): string[] {
  const roots: string[] = [FRONTX_NAMESPACE_ROOT, ...RESERVED_ENVIRONMENT_ENTRIES, ...terms.projectOwnedRoots];
  for (const declared of terms.excludedSubtrees) {
    roots.push(joinUnderTarget(terms.target, declared));
  }
  if (terms.localOriginFolder !== undefined) {
    roots.push(terms.localOriginFolder);
  }
  return roots;
}

/**
 * Whether `path` (a project-relative POSIX path) lies within the target's
 * effective ownership: at or inside `target`, and at or inside none of the
 * exclusion roots `computeExclusionRoots` names for it.
 */
export function isWithinEffectiveOwnership(path: string, target: string, exclusionRoots: string[]): boolean {
  if (!pathWithinTarget(path, target)) return false;
  return !exclusionRoots.some((root) => pathWithinTarget(path, root));
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-delete-plan:p1:inst-dp-compute-ownership
// @cpt-end:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-compute-ownership
