// @cpt-FEATURE:cpt-frontx-feature-upgrade-changeset:p1
//
// Projects an internal `UpgradePlan` down to the shape a DEVELOPER (or a
// calling program) is shown for review.
//
// WHY THIS PROJECTION EXISTS. `UpgradePlan.operations` carries three content
// fields the COMMIT algorithm needs and the reviewer must never be handed:
// `expectedDisk` (what classification saw, which `inst-com-verify-destinations`
// re-checks immediately before the first rename), `newContent` (the bytes an
// `ADD`/`REPLACE` will land), and `baselineContent` (what
// `inst-com-restore-on-error` writes back to reverse a landed operation).
// They exist so the plan a developer approved is the plan that lands, byte for
// byte, without a recomputation in between.
//
// Passing that structure straight into the result envelope puts up to THREE
// FULL COPIES of every changed file's contents into the command's output. That
// is wrong on two counts, and the second is the load-bearing one:
//
//   - It contradicts what the plan IS. `cpt-frontx-adr-project-upgrade-
//     mechanism` fixes whole-file granularity precisely so that "a plan a
//     developer reviews before anything is written must be reviewable as a
//     list of files and actions, not as textual deltas inside them", and
//     states there is "no hunk, region-marker, or line-level representation
//     anywhere in this plan". File CONTENT in the reviewable payload is a
//     textual delta by another name — worse, an unlabelled one.
//   - It publishes the BASELINE's content alongside the candidate's. A
//     reviewer asked to approve a transition does not need, and should not be
//     handed, a copy of what is currently on disk plus a copy of what was
//     there at the recorded baseline.
//
// So the reviewable projection carries exactly what the FEATURE's own
// `inst-present-changeset` step enumerates: the `from` and `to` origin/version
// pairs, every target the plan covers, one `{target, path, op}` per classified
// path, and every `SKIPPED` path with the reason it was skipped. Nothing else.
import { createHash } from 'node:crypto';
import type { SkipReason, UpgradeOpKind, UpgradePlan } from './types';
import { canonicalJson } from '../canonical-json';

// One classified path as a reviewer sees it: which target, which path, which
// of the five whole-file operations. No content, by construction rather than
// by a caller remembering to strip it.
export interface ReviewableOperation {
  target: string;
  path: string;
  op: UpgradeOpKind;
}

export interface ReviewableSkippedPath {
  target: string;
  path: string;
  reason: SkipReason;
}

export interface ReviewablePlan {
  name: string;
  from: { origin: string; version: string };
  to: { origin: string; version: string };
  targets: string[];
  operations: ReviewableOperation[];
  skipped: ReviewableSkippedPath[];
  // Who records the ground behind the `RETAINED_GROUND` skips (`RetainedGroundHolder`).
  retainedGround?: { template: string; ground: string }[];
  // The AI bundle replacement: every add/replace/removal against the current
  // destination (including local edits, shown as `replace`/`local-only`). Hashes
  // and lengths only, never bytes.
  ai?: {
    destination: string;
    changes: { path: string; kind: string }[];
    files: { path: string; length: number; sha256: string }[];
    // What the destination holds now (lengths and hashes), so a reviewer can tell
    // which local files a `replace`/`local-only` change discards.
    existing: { path: string; length: number; sha256: string; linkTarget?: string }[];
  };
}

/**
 * The ONE projection every caller that shows a plan to anyone goes through —
 * the machine-readable envelope's `details.plan` and the human presenter
 * alike. Kept as a single function so no caller can accidentally serialize
 * the internal plan directly, which is exactly the defect this module was
 * added to close.
 */
export function renderReviewablePlan(plan: UpgradePlan): ReviewablePlan {
  return {
    name: plan.name,
    from: { origin: plan.from.origin, version: plan.from.version },
    to: { origin: plan.to.origin, version: plan.to.version },
    targets: [...plan.targets],
    // Explicit field-by-field construction, never a spread-minus-omit: a
    // spread would silently start carrying any content field a future
    // `UpgradeOperation` gains, which is precisely how this leak would come
    // back.
    operations: plan.operations.map((operation) => ({
      target: operation.target,
      path: operation.path,
      op: operation.op,
    })),
    skipped: plan.skipped.map((entry) => ({
      target: entry.target,
      path: entry.path,
      reason: entry.reason,
    })),
    // Names and project-relative roots only, no content; present only when a skip
    // was held back by recorded ground.
    ...(plan.retainedGroundHolders !== undefined && plan.retainedGroundHolders.length > 0
      ? { retainedGround: plan.retainedGroundHolders.map(({ template, ground }) => ({ template, ground })) }
      : {}),
    ...(plan.ai !== undefined
      ? {
          ai: {
            destination: plan.ai.destination.path,
            changes: plan.ai.changes.filter((c) => c.kind !== 'unchanged').map(({ path, kind }) => ({ path, kind })),
            files: plan.ai.files.map(({ path, length, sha256, linkTarget }) => ({ path, length, sha256, ...(linkTarget === undefined ? {} : { linkTarget }) })),
            existing: plan.ai.existing.map(({ path, length, sha256, linkTarget }) => ({ path, length, sha256, ...(linkTarget === undefined ? {} : { linkTarget }) })),
          },
        }
      : {}),
  };
}

/**
 * Plain-language consequences a reviewer must see next to the file lists, each
 * already settled by a human ruling: the AI bundle is replaced as a whole, so
 * local edits in it are overwritten and files only the destination has are
 * removed (r9 §1, ruling 2026-11-08); protected paths are skipped and reported
 * while the recorded version still advances, so a later upgrade may conflict on
 * them (ruling 2026-11-06, option 2).
 */
export function reviewNotes(plan: UpgradePlan): string[] {
  const notes: string[] = [];
  if (plan.ai !== undefined) {
    const identity = plan.ai.destination.identity as { ancestors?: { type?: string; target?: string }[] };
    const link = identity.ancestors?.find((entry) => entry.type === 'symlink');
    if (link) notes.push(`AI bundle ${plan.ai.destination.path} is a symbolic link to ${JSON.stringify(link.target)}; the link itself will be replaced and its target will be left untouched.`);
    for (const entry of plan.ai.existing) if (entry.linkTarget !== undefined) {
      notes.push(`AI bundle entry ${entry.path} is a symbolic link to ${JSON.stringify(entry.linkTarget)}; the link itself will be removed or replaced and its target will be left untouched.`);
    }
    const replaced = plan.ai.changes.filter((c) => c.kind === 'replace').length;
    const removed = plan.ai.changes.filter((c) => c.kind === 'local-only' || c.kind === 'local-only-directory').length;
    if (replaced > 0 || removed > 0) {
      notes.push(
        `AI bundle ${plan.ai.destination.path}: ${replaced} file(s) will be overwritten and ${removed} file(s)/folder(s) ` +
          'that only the project has will be removed; local edits there are not kept.',
      );
    }
  }
  const skipNote = protectedSkipNote(plan);
  if (skipNote !== undefined) notes.push(skipNote);
  return notes;
}

/** The disclosed risk of skipping protected paths (ruling 2026-11-06, option 2); reported before and after. */
export function protectedSkipNote(plan: UpgradePlan): string | undefined {
  const protectedSkips = plan.skipped.filter((entry) => entry.reason === 'OUTSIDE_BOUNDARY').length;
  return protectedSkips > 0
    ? `${protectedSkips} path(s) are skipped as protected and keep their current bytes; the recorded version still ` +
        'advances, so a later upgrade may conflict on them.'
    : undefined;
}

/**
 * Identity of the WHOLE internal plan — every operation's `newContent`,
 * `expectedDisk` and `baselineContent` included, not just the
 * `{target, path, op}` projection a reviewer sees. The reviewed list of files
 * and actions cannot tell two plans apart whose bytes differ (a candidate
 * file edited, or a destination changed, after the review), so approval is
 * bound to this digest instead: the review envelope carries it
 * (`details.planDigest`), and the confirming `--yes` call states it
 * (`--plan-digest=<hex>`); the confirming call recomputes its own plan and
 * commits only when the two digests are equal. A digest is a one-way hash, so
 * carrying it puts no file content into the envelope — the leak
 * `renderReviewablePlan` exists to prevent stays closed.
 */
export function computePlanDigest(plan: UpgradePlan): string {
  // Each content field is folded to `{length, sha256}` BEFORE canonical JSON:
  // `canonicalJson` walks a Buffer as an object with one member per byte, so
  // a plan carrying tens of MB of changed binaries exceeded V8's string
  // limit (and heap) in both the review and the confirming call. The fold
  // keeps the binding exact — one changed byte changes the sha256 — and is
  // the same shape `commands/apply-ai-review.ts` already hashes AI files to.
  const operations = plan.operations.map((op) => ({
    ...op,
    expectedDisk: contentIdentity(op.expectedDisk),
    baselineContent: contentIdentity(op.baselineContent),
    ...(op.newContent === undefined ? {} : { newContent: contentIdentity(op.newContent) }),
  }));
  return createHash('sha256').update(canonicalJson({ ...plan, operations })).digest('hex');
}

function contentIdentity(content: Buffer | string | null): { length: number; sha256: string } | null {
  if (content === null) return null;
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return { length: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
