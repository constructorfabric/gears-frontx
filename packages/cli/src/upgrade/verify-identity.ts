/**
 * Identity verification for a re-resolved upgrade baseline/target pair.
 *
 * The upgrade engine re-resolves both diff sides from the address the
 * provenance record carries, and since `cpt-frontx-adr-source-spec-syntax`
 * admits subtree addressing, one address can legitimately begin serving a
 * different template — the repository reorganized, the subtree renamed, the
 * content at the address replaced. Nothing in acquisition notices: both
 * fetches succeed and both manifests are well-formed. This module is the gate
 * that decides whether the two resolved versions and the record describe ONE
 * template, and it runs before any diff so a mismatch costs no content read.
 *
 * Kept separate from `compute.ts` because the decision is pure — three
 * identities and a source-spec in, a verdict out — and is therefore provable
 * without a fetch double.
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-compute:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-computation:p1
import { parseSourceSpec } from '../spec-parser/parse';

export type VerifyTemplateIdentityResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'identity-drift-between-versions';
      baselineIdentity: string;
      targetIdentity: string;
      message: string;
    }
  | {
      ok: false;
      reason: 'record-identity-unrecognized';
      recordedIdentity: string;
      declaredIdentity: string;
      message: string;
    };

export interface VerifyTemplateIdentityInput {
  /** `templateIdentity` as the provenance record carries it. */
  recordedIdentity: string;
  /** The record's re-resolvable source-spec — the address BOTH sides came from. */
  sourceSpec: string;
  /** Identity the baseline version's own manifest declares. */
  baselineIdentity: string;
  baselineVersion: string;
  /** Identity the target version's own manifest declares. */
  targetIdentity: string;
  targetVersion: string;
}

/**
 * Decides whether an upgrade may proceed from the identities involved, and
 * refuses with the pair that failed to agree named.
 *
 * Both declared identities arrive already established: `resolveToInventory`
 * takes each from that version's own manifest and refuses content whose
 * manifest is unreadable, so neither side can reach this comparison as an
 * unread value that happens to compare equal.
 *
 * A record written before identity came from the manifest carries the
 * repository name, which no manifest declares any more, and refusing it would
 * lock every pre-existing project out of upgrading. The tolerance that admits
 * it stays narrow rather than blanket: only the one value the previous scheme
 * could have derived from this very address, so a record explained by neither
 * scheme is refused instead of assumed to match.
 *
 * @param input - The record's identity and source-spec, plus each resolved
 *   side's manifest-declared identity and the version it was resolved at
 * @returns `ok` when the upgrade may proceed, including the tolerated
 *   pre-manifest-identity case; otherwise the refusal and the identities compared
 */
export function verifyTemplateIdentity(
  input: VerifyTemplateIdentityInput,
): VerifyTemplateIdentityResult {
  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-identity-drift
  if (input.baselineIdentity !== input.targetIdentity) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-abort-identity-drift
    return {
      ok: false,
      reason: 'identity-drift-between-versions',
      baselineIdentity: input.baselineIdentity,
      targetIdentity: input.targetIdentity,
      message:
        `Source-spec "${input.sourceSpec}" resolves to the template "${input.targetIdentity}" at version ` +
        `"${input.targetVersion}", but to "${input.baselineIdentity}" at the recorded baseline version ` +
        `"${input.baselineVersion}", so no change set was computed. The address serves a different template ` +
        `than the one this project was scaffolded from. Point the provenance record's source-spec at the ` +
        `address that still serves "${input.baselineIdentity}", or adopt "${input.targetIdentity}" as a ` +
        'separate template by installing it and adding it to this project.',
    };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-abort-identity-drift
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-identity-drift

  // The baseline is the version the record was written from, so it is the side
  // the record's identity is expected to match by construction. The drift gate
  // above has already established that the target declares the same value, so
  // checking the record against the baseline settles it against both.
  const declaredIdentity = input.baselineIdentity;

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-record-identity-differs
  if (input.recordedIdentity !== declaredIdentity) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-legacy-record
    if (recordsPreManifestIdentity(input.recordedIdentity, input.sourceSpec)) {
      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-accept-legacy-record
      // What passes here is an identity the region-marker lookup downstream
      // cannot serve: `computeChangeSet` matches regions by the record's
      // `templateIdentity`, while the content's markers carry the manifest
      // identity. A `region-union` shared file therefore diffs no region for
      // such a record, and a marker set that changed identity between the two
      // versions reads as a removal. Admitting the record is still the right
      // call — the whole-file diff of every exclusive subtree is correct, and
      // the alternative is refusing the upgrade outright — but the boundary of
      // what it buys is this. Tracked in #543.
      return { ok: true };
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-accept-legacy-record
    }
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-legacy-record

    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-record-unrecognized
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-abort-record-unrecognized
    return {
      ok: false,
      reason: 'record-identity-unrecognized',
      recordedIdentity: input.recordedIdentity,
      declaredIdentity,
      message:
        `Provenance records this project as scaffolded from the template "${input.recordedIdentity}", but ` +
        `source-spec "${input.sourceSpec}" resolves to "${declaredIdentity}" at both the recorded baseline ` +
        `version "${input.baselineVersion}" and the target version "${input.targetVersion}", and ` +
        `"${input.recordedIdentity}" is not the repository that source-spec addresses either. The template ` +
        'being upgraded cannot be established, so no change set was computed. Correct the provenance ' +
        "record's identity or its source-spec to name one template.",
    };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-abort-record-unrecognized
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-record-unrecognized
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-record-identity-differs

  return { ok: true };
}

// Whether the record's identity is the value the pre-manifest-identity scheme
// derived from this very address: the repository name (`ref.repo`), which is
// what `resolveToInventory` returned before identity came from the manifest.
//
// The subtree requirement is what keeps the tolerance from widening into a
// blanket pass. Subtree addressing and manifest-declared identity arrived in
// one change, so a record whose source-spec carries a subtree was written by
// code that already took identity from the manifest, and its recorded identity
// has no legitimate reason to differ. Matching the repository name for such a
// record would excuse a genuine mismatch — a subtree serving `packages/web`
// out of repository `acme-templates` would be waved through on the repository
// name the record could never have held.
//
// A source-spec that no longer parses yields no address to compare, so it
// matches nothing: the caller's refusal is the fail-closed outcome, and
// guessing here would turn an unreadable record into a silent match.
function recordsPreManifestIdentity(recordedIdentity: string, sourceSpec: string): boolean {
  const parsed = parseSourceSpec(sourceSpec);
  if (!parsed.ok) return false;
  return parsed.value.subtree === undefined && recordedIdentity === parsed.value.repo;
}
