import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../canonical-json';
import { getOwn } from '../own-record';
import type { AiReviewSnapshot } from '../operations/ai-review';
import type { ProjectStateDocument } from '../project-state/types';

/**
 * The AI-bundle side of `apply`/`seed` (plan-ai-recovery r9 §5), decided BEFORE
 * any side effect of the command (inventory auto-install, seed's registration
 * probe and state writes, payload writes): a name gaining its first target whose
 * `.frontx/ai/<name>/` already exists would REPLACE that tree. Creating an absent
 * bundle stays the ordinary path. A replacement is reviewed — every
 * add/replace/removal against the current destination, local edits included —
 * and runs only on approval of that review's digest, writing only the reviewed
 * snapshot bytes. The candidate is acquired once, without installing anything.
 */

/**
 * What stands at `.frontx/ai/<name>`: `absent` (some component missing, every
 * present one a plain directory), `plain` (the whole chain is plain directories)
 * or `blocked` (a file, link, special entry, or unreadable component on the way).
 */
export function classifyAiDestination(projectRoot: string, manifestName: string): 'absent' | 'plain' | 'blocked' {
  let current: string;
  try {
    current = fs.realpathSync(projectRoot);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'blocked';
  }
  for (const part of ['.frontx', 'ai', ...manifestName.split('/')]) {
    current = path.join(current, part);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'blocked';
    }
    if (!stat.isDirectory()) return 'blocked';
  }
  return 'plain';
}

/** Every component of `.frontx/ai/<name>` exists and is a plain directory (not a link). */
export function aiDestinationIsPlainDirectory(projectRoot: string, manifestName: string): boolean {
  return classifyAiDestination(projectRoot, manifestName) === 'plain';
}

/**
 * Identity of a whole candidate folder (plan-ai-recovery r9 §130): every entry's
 * relative path and type, regular-file bytes and link text, never followed.
 * `node_modules` is skipped exactly as the installed-content reader skips it.
 */
export function hashCandidateTree(root: string): string {
  const hash = createHash('sha256');
  const visit = (relative: string) => {
    const absolute = path.join(root, relative);
    for (const name of fs.readdirSync(absolute).sort()) {
      if (name === 'node_modules') continue;
      const child = relative === '' ? name : `${relative}/${name}`;
      const stat = fs.lstatSync(path.join(root, child));
      if (stat.isDirectory()) {
        hash.update(`d\0${child}\0`);
        visit(child);
      } else if (stat.isFile()) {
        hash.update(`f\0${child}\0${createHash('sha256').update(fs.readFileSync(path.join(root, child))).digest('hex')}\0`);
      } else if (stat.isSymbolicLink()) {
        hash.update(`l\0${child}\0${fs.readlinkSync(path.join(root, child))}\0`);
      } else {
        hash.update(`o\0${child}\0`);
      }
    }
  };
  visit('');
  return hash.digest('hex');
}

function candidateShipsBundle(root: string, name: string): boolean {
  try {
    return fs.lstatSync(path.join(root, '.frontx', 'ai', name)).isDirectory();
  } catch {
    return false;
  }
}

export type ApplyAiSource =
  | { kind: 'source'; root: string }
  /** `identity`: hash of the WHOLE acquired candidate (payload and AI), not only its AI tree. */
  | { kind: 'bytes'; files: ReadonlyMap<string, Uint8Array> | undefined; identity: string }
  | { kind: 'refused'; message: string }
  | { kind: 'unknown' };

export interface ApplyAiReviewInput {
  projectRoot: string;
  names: readonly string[];
  /** `null` for a project with no state yet (seed). */
  document: ProjectStateDocument | null;
  /** Where the name's candidate content lives — a folder, or bytes acquired in memory — without installing anything. */
  sourceOf: (name: string) => Promise<ApplyAiSource>;
  /** Read-only capture of replacing the destination with a source folder's bundle. */
  capture: (sourceRoot: string, projectRoot: string, name: string) => AiReviewSnapshot;
  /** Identity of a whole candidate folder (`hashCandidateTree`). */
  hashSource: (root: string) => string;
  /** Read-only capture of replacing the destination with in-memory candidate bytes. */
  captureBytes: (projectRoot: string, name: string, files: ReadonlyMap<string, Uint8Array> | undefined) => AiReviewSnapshot;
  /** `refuse`: a blocker on the destination path fails closed before any effect (seed). */
  blocked: 'skip' | 'refuse';
  /** Everything else the approval covers (the command, its batch and flags). */
  scope: unknown;
}

export type ApplyAiReview =
  | {
      ok: true;
      snapshots: Map<string, AiReviewSnapshot>;
      /** The full candidate identity each reviewed name was approved against, and the folder to re-check it at effect time. */
      candidates: Map<string, { identity: string; root?: string }>;
      needsApproval: boolean;
      planDigest: string;
      reviewable: ReviewableAiReplacement[];
    }
  | { ok: false; message: string; details: Record<string, unknown> };

export interface ReviewableAiReplacement {
  name: string;
  destination: string;
  changes: { path: string; kind: string }[];
  files: { path: string; length: number; sha256: string }[];
  existing: { path: string; length: number; sha256: string }[];
}

/** Side-effect free: reads the project and the candidate sources only. */
export async function reviewApplyAiReplacements(input: ApplyAiReviewInput): Promise<ApplyAiReview> {
  const snapshots = new Map<string, AiReviewSnapshot>();
  const candidates = new Map<string, { identity: string; root?: string }>();
  for (const name of [...new Set(input.names)].sort()) {
    if ((input.document ? (getOwn(input.document.templates, name)?.targets.length ?? 0) : 0) > 0) continue; // not gaining its first target
    const destination = classifyAiDestination(input.projectRoot, name);
    if (destination === 'absent') continue; // ordinary first creation
    const source = await input.sourceOf(name);
    if (source.kind === 'unknown') continue; // the command's own resolution refuses this name
    if (source.kind === 'refused') {
      return { ok: false, message: source.message, details: { aiBundle: `.frontx/ai/${name}`, name } };
    }
    const shipsBundle = source.kind === 'source' ? candidateShipsBundle(source.root, name) : (source.files?.size ?? 0) > 0;
    if (destination === 'blocked') {
      // A candidate without a bundle never touches the destination; otherwise a
      // blocker cannot be represented in a review and is never reclaimed unreviewed.
      if (!shipsBundle || input.blocked === 'skip') continue;
      return {
        ok: false,
        message:
          `Something other than a plain directory stands at or above .frontx/ai/${name}; it cannot be reviewed, so nothing ` +
          'was written. Inspect that path and move it aside before retrying.',
        details: { aiBundle: `.frontx/ai/${name}`, name },
      };
    }
    // A folder candidate is hashed before AND after its AI tree is captured: the
    // review, the digest and the effect-time re-check must all describe ONE state
    // of the folder, so a change in between refuses the review instead of binding
    // an AI diff from one state to the full identity of another.
    const before = source.kind === 'source' ? input.hashSource(source.root) : source.identity;
    const snapshot =
      source.kind === 'source' ? input.capture(source.root, input.projectRoot, name) : input.captureBytes(input.projectRoot, name, source.files);
    if (source.kind === 'source' && input.hashSource(source.root) !== before) {
      return {
        ok: false,
        message: `The candidate for "${name}" changed while it was being reviewed; nothing was written. Retry once it is stable.`,
        details: { name, aiBundle: `.frontx/ai/${name}` },
      };
    }
    // A candidate without a bundle leaves the existing tree untouched (no transition).
    if ((snapshot.destination.identity as { sourceState?: string }).sourceState === 'absent') continue;
    snapshots.set(name, snapshot);
    candidates.set(name, source.kind === 'source' ? { identity: before, root: source.root } : { identity: before });
  }
  const reviewable = [...snapshots].map(([name, snapshot]) => ({
    name,
    destination: snapshot.destination.path,
    changes: snapshot.changes.filter((c) => c.kind !== 'unchanged').map(({ path: p, kind }) => ({ path: p, kind })),
    files: snapshot.files.map(({ path: p, length, sha256 }) => ({ path: p, length, sha256 })),
    // What the destination holds now, so the reviewer sees which local files are overwritten or removed.
    existing: snapshot.existing.map(({ path: p, length, sha256, linkTarget }) => ({ path: p, length, sha256, ...(linkTarget === undefined ? {} : { linkTarget }) })),
  }));
  // The token binds every reviewed AI tree AND the command it belongs to, so it
  // cannot approve a different batch, target set or flag combination.
  const planDigest = createHash('sha256')
    .update(
      canonicalJson({
        kind: 'frontx.apply-ai-replacement',
        v: 3,
        scope: input.scope,
        reviews: [...snapshots].map(([name, s]) => ({ name, digest: s.digest, candidate: candidates.get(name)?.identity })),
      }),
    )
    .digest('hex');
  return { ok: true, snapshots, candidates, needsApproval: reviewable.some((r) => r.changes.length > 0), planDigest, reviewable };
}
