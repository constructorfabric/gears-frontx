import type { OwnershipBoundary } from '../manifest/types';
import { pathsNest } from '../paths/relative-path';
import type { StagedAssembly } from './types';
import type { BoundaryConflictEntry, ConflictVerdict, OccupiedBoundaryEntry } from './state';

// A single boundary claim tagged with its owning template identity — the
// comparison unit inst-cc-combine builds by combining the staged assembly's
// declared boundaries with the boundaries already occupied in the target
// repository.
//
// `staged` separates the two halves because only pairs involving a staged claim
// are judged (inst-cc-foreach-pair). Carried on the claim rather than inferred
// from its position so the narrowing does not silently depend on staged claims
// being built first.
interface BoundaryClaim {
  templateName: string;
  boundary: OwnershipBoundary;
  staged: boolean;
}

// @cpt-dod:cpt-frontx-dod-cli-scaffolding-conflict-check:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-conflict-check:p1
/**
 * The F12 pre-flight assembly conflict checker (Option C) realizing
 * `cpt-frontx-algo-cli-scaffolding-conflict-check`. Combines the STAGED
 * assembly's declared ownership boundaries with the boundaries already
 * occupied by the repository's applied templates, compares every pair of
 * boundary claims in which at least one side is staged, and detects three clash
 * kinds: an exclusive-subtree clash
 * (two templates claiming overlapping exclusive subtrees — the same subtree,
 * the same directory under two spellings, or one nested inside the other), an
 * exclusive shared-file clash (two templates claiming the same shared-file path
 * where either both declare merge strategy `exclusive`, or one declares
 * `exclusive` while the other declares `region-union` — whole-file ownership of
 * a shared file cannot be shared), and a region-key clash (two templates
 * declaring merge strategy `region-union` on the same shared-file path and
 * claiming the same declared region key). When any conflict is found the whole
 * assembly is REFUSED — the report names each contested ground, both claims
 * when the two spellings differ, and the contesting templates, before any file
 * is written; conflicting claims are never silently merged. On no conflict,
 * returns a pass so the P14 uniform-apply core can proceed.
 *
 * This is the SOLE authority for boundary-collision arbitration over the shapes
 * it judges - the A2 reframe relocated arbitration OUT of composed-provenance
 * recursive resolution (`cpt-frontx-algo-composed-provenance-recursive-resolution`)
 * INTO this check, and nothing downstream re-examines what it waves through. The
 * shapes are exclusive subtree against exclusive subtree and shared file against
 * shared file; a cross-kind collision, where one template's exclusive subtree
 * contains another's declared shared-file path, is compared by neither loop and
 * is not yet judged anywhere (issue #546).
 */
export function checkAssemblyConflicts(
  assembly: StagedAssembly,
  alreadyOccupiedBoundaries: OccupiedBoundaryEntry[],
): ConflictVerdict {
  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-combine
  // Combine the staged assembly's declared boundaries with the boundaries
  // already occupied in the target repository into one comparison set, each
  // entry tagged with its owning template identity.
  const claims: BoundaryClaim[] = [
    ...assembly.contributions.map((contribution) => ({
      templateName: contribution.templateName,
      boundary: contribution.ownershipBoundaries,
      staged: true,
    })),
    ...alreadyOccupiedBoundaries.map((occupied) => ({
      templateName: occupied.templateName,
      boundary: occupied.boundary,
      staged: false,
    })),
  ];
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-combine

  const conflicts: BoundaryConflictEntry[] = [];

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-foreach-pair
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const claimA = claims[i];
      const claimB = claims[j];

      // Every pair judged here has a staged claim in it. Two claims already
      // recorded in the target repository describe what it holds, not what this
      // operation would do to it: an inconsistency between them is one this add
      // did not create, and refusing an unrelated add cannot repair it. Without
      // the narrowing, one such pair would make every later operation on that
      // repository impossible for a reason no later operation introduced.
      //
      // The cost is that an occupied-occupied overlap is never surfaced at add
      // time. Occupied boundaries are not frozen when a template is applied:
      // `occupiedBoundariesFromProvenance` reads each installed template's
      // CURRENT manifest, so a `frontx install` or `update-local` that widens
      // one manifest can leave two occupied claims overlapping, or even equal,
      // after both were admitted, and this check stays silent about it. The
      // developer does have moves there (roll the widened install back, or
      // relocate one of the templates); what they do not get from here is a
      // report telling them to.
      if (!claimA.staged && !claimB.staged) continue;

      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-if-subtree-clash
      // Overlap (`pathsNest`), not string equality: nothing downstream
      // arbitrates a claim this check waves through, so admitting only
      // identical spellings would leave a nested pair unarbitrated
      // (`cpt-frontx-dod-cli-scaffolding-conflict-check`).
      for (const subtreeA of claimA.boundary.exclusiveSubtrees) {
        for (const subtreeB of claimB.boundary.exclusiveSubtrees) {
          if (!pathsNest(subtreeA, subtreeB)) continue;
          // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-if-subtree-clash

          // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-record-subtree-conflict
          // Record the exclusive-subtree conflict — the contested ground and
          // the two contesting template identities.
          conflicts.push({
            ground: contestedSubtreeGround(subtreeA, subtreeB),
            contestants: [claimA.templateName, claimB.templateName],
          });
          // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-record-subtree-conflict
        }
      }
      for (const sharedA of claimA.boundary.sharedFiles) {
        for (const sharedB of claimB.boundary.sharedFiles) {
          if (sharedA.path !== sharedB.path) continue;

          // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-if-exclusive-clash
          // Both templates claim the same shared-file path AND either both
          // declare merge strategy `exclusive` for it, or one declares
          // `exclusive` while the other declares `region-union` — whole-file
          // ownership of a shared file cannot be shared.
          const eitherExclusive = sharedA.mergeStrategy === 'exclusive' || sharedB.mergeStrategy === 'exclusive';
          if (eitherExclusive) {
            // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-if-exclusive-clash

            // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-record-exclusive-conflict
            // Record a conflict entry naming the contested file path and the
            // two contesting template identities.
            conflicts.push({ ground: sharedA.path, contestants: [claimA.templateName, claimB.templateName] });
            // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-record-exclusive-conflict
            continue;
          }

          // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-if-region-key-clash
          // Both templates declare merge strategy `region-union` on the same
          // shared-file path AND claim the same declared region key.
          const sharedRegionKeys = sharedA.ownedRegions.filter((region) => sharedB.ownedRegions.includes(region));
          for (const regionKey of sharedRegionKeys) {
            // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-if-region-key-clash

            // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-record-region-conflict
            // Record a conflict entry naming the contested file path, the
            // contested region key (folded into the ground as
            // `${path}#${regionKey}`), and the two contesting template
            // identities.
            conflicts.push({
              ground: `${sharedA.path}#${regionKey}`,
              contestants: [claimA.templateName, claimB.templateName],
            });
            // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-record-region-conflict
          }
        }
      }
    }
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-foreach-pair

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-if-any-conflict
  if (conflicts.length > 0) {
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-if-any-conflict

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-return-conflict
    // Refuse the whole assembly and return the conflict report — naming every
    // contested ground and its contesting templates — BEFORE any file is
    // written. Never silently merged.
    return { ok: false, conflicts };
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-return-conflict
  }

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-return-pass
  // No intersecting boundary claim — pass, so the P14 uniform-apply core can
  // proceed to materialize the assembly.
  return { ok: true };
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-conflict-check:p1:inst-cc-return-pass
}

// The contested ground two overlapping exclusive-subtree claims are reported as.
// Two identical spellings name the one string both templates wrote; any other
// overlap names BOTH claims, in the order `contestants` names their templates,
// because either claim alone identifies only one of the two declarations the
// developer has to reconcile.
function contestedSubtreeGround(subtreeA: string, subtreeB: string): string {
  return subtreeA === subtreeB ? subtreeA : `${subtreeA} overlaps ${subtreeB}`;
}
