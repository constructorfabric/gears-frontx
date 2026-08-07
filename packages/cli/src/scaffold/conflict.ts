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
 * This is the SOLE authority for boundary-collision arbitration — the A2
 * reframe relocated arbitration OUT of composed-provenance recursive
 * resolution (`cpt-frontx-algo-composed-provenance-recursive-resolution`)
 * INTO this check.
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
      // operation would do to it, and the developer has no move that resolves a
      // contest between them: both records are on disk and neither is the thing
      // being applied. Refusing on such a pair would make every later add
      // impossible for a reason no later add introduced.
      //
      // The pair reaches here at all because a repository can hold one:
      // arbitration only became segment-aware after these records were written,
      // and the equality comparison that admitted a nested occupant is gone
      // while its provenance record remains. Under that comparison an EQUAL
      // occupied pair was unreachable — the second template's own add would have
      // been refused — which is why the narrowing was not needed before and is
      // not a relaxation of anything that used to be caught.
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
