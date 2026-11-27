// @cpt-FEATURE:cpt-frontx-feature-composed-provenance:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-contract-ownership:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-atomic-project-state:p1
//
// The project state document's concrete shape —
// `cpt-frontx-contract-project-provenance` — and the injected I/O seams its
// atomic read/write algorithm (`cpt-frontx-algo-composed-provenance-project-
// state-io`) depends on. This feature is the OWNER of this schema
// (`cpt-frontx-dod-composed-provenance-contract-ownership`); every other
// feature that reads or writes `.frontx/project.json` cites these types
// rather than declaring its own.

/** One generation a name's most recent upgrade or restore moved it away
 * from — absent until the name's first upgrade, never a longer history.
 * Written and rotated only by `cpt-frontx-feature-upgrade-changeset`'s
 * commit; cleared only by this feature's own `register --replace`
 * (`inst-cpreg-write-replace`), which starts a new lineage for the name.
 * This feature declares the field as part of the schema it owns and does
 * not itself read it (FEATURE §1.1). */
export interface PreviousOrigin {
  origin: string;
  version: string;
}

export interface TemplateEntry {
  origin: string;
  version: string;
  targets: string[];
  previous?: PreviousOrigin;
  /** Declarations recorded at register, apply or upgrade. Delete combines
   * them with the current manifest to preserve excluded ground (FEATURE §1.1). */
  excludedSubtrees?: string[];
  /** The recorded declaration cannot establish what earlier writes excluded.
   * Apply, register and upgrade maintain this mark for delete and upgrade.
   * Requires formatVersion 2 or later (composed-provenance FEATURE §1.1). */
  exclusionsBackfilled?: true;
  /** Project-relative directory roots, without a trailing slash, retained
   * across target or declaration changes. Delete preserves this ground.
   * Requires formatVersion 2 or later (composed-provenance FEATURE §1.1). */
  relinquishedGround?: string[];
  /** Target-relative manifest declarations, with a trailing slash, excluded
   * by every write of a marked entry. Apply and upgrade narrow the proof
   * used by upgrade and delete. Requires formatVersion 2 or later (FEATURE §1.1). */
  provenExcludedSubtrees?: string[];
  /** Upgrade or restore records outstanding tasks alongside the new origin.
   * Recovery advances them after verification and clears the finalized
   * record. Requires formatVersion 3 (composed-provenance FEATURE §1.1). */
  pendingPostCommit?: PendingPostCommit;
}

export type PostCommitTaskStatus = 'pending' | 'done' | 'not-required';

export interface PendingPostCommit {
  /** The transition's recovery-record id (`operations/coordination.ts`). */
  intentId: string;
  inventory: PostCommitTaskStatus;
  ai: PostCommitTaskStatus;
  /** Verified effect hashes of the `done` tasks. */
  effects?: { inventory?: string; ai?: string };
}

export interface ProjectStateDocument {
  /** Once a document records post-commit work it stays at 3. Otherwise,
   * ownership protection fields require 2 and all other documents use 1. */
  formatVersion: 1 | 2 | 3;
  templates: Record<string, TemplateEntry>;
  projectOwnedRoots: string[];
}

// Injected dependency types — no direct filesystem access in core logic,
// mirroring `upgrade/types.ts`'s `ReadProjectFileFn`/`WriteProjectFileFn`
// convention exactly: absence is signaled by `null`, never a throw, and the
// caller supplies the already-resolved absolute path rather than the
// function computing it itself.
export type ReadProjectStateFn = (absolutePath: string) => Promise<string | null>;
export type WriteProjectStateFn = (absolutePath: string, content: string) => Promise<void>;

/**
 * A described mutation is a pure data transform on the in-memory document —
 * never a raw JSON patch — so `inst-psio-construct-copy` has exactly one
 * change to apply and nothing else (FEATURE §3 "Atomic Project State
 * Read/Write", Input). `set-template` covers both create and replace: the
 * caller (register's own algorithm) decides which by inspecting the read
 * document first: this seam does not itself distinguish them.
 */
export type ProjectStateMutation =
  | { kind: 'set-template'; name: string; entry: TemplateEntry }
  | { kind: 'remove-template'; name: string }
  | { kind: 'add-owned-root'; path: string }
  // `verbatim`, when given, is the spelling the caller was handed before it
  // canonicalised: an entry recorded exactly so is removed in preference to
  // `path`, so a state holding a spelling the canonicaliser would never produce
  // (a symlink alias of a root) can still be repaired by naming it.
  | { kind: 'remove-owned-root'; path: string; verbatim?: string };

/**
 * The document could not be parsed as `{ formatVersion, templates,
 * projectOwnedRoots }` (`inst-psio-if-malformed`). A PLAIN result value —
 * NOT yet the shared `{ok:false, error:{code,message,details}}` envelope
 * `cpt-frontx-adr-cli-machine-readable-output` fixes (`envelope.ts`,
 * built separately) — because this module is pure project-state logic with
 * no dependency on the command-dispatch layer that owns rendering that
 * envelope; a caller one layer up (register/unregister, a later checkpoint)
 * is what maps this into `PROJECT_INVALID`.
 */
export interface ProjectStateInvalidResult {
  ok: false;
  error: 'PROJECT_INVALID';
  message: string;
  // Present when the refusal names one offending recorded path: `{ name,
  // target }` for a `templates[name].targets` entry, `{ path }` for a
  // `projectOwnedRoots` one — the shape `validate --project` has always
  // reported for a non-canonical target, carried through the load so the
  // `--json` contract does not depend on which layer noticed.
  details?: Record<string, string>;
}

export interface ProjectStateOkResult {
  ok: true;
  document: ProjectStateDocument;
}

/** Outcome of a read-only request (`inst-psio-if-read`). */
export type ReadProjectStateResult = ProjectStateOkResult | ProjectStateInvalidResult;

/** Outcome of a described mutation (`inst-psio-if-mutate`) — the document
 * carried on success is the one just written, reflecting exactly the
 * described change and nothing else (`inst-psio-return-written`). */
export type MutateProjectStateResult =
  | (ProjectStateOkResult & {
      /** The `projectOwnedRoots` spelling a `remove-owned-root` actually matched; absent when none was. */
      removedPath?: string;
    })
  | ProjectStateInvalidResult;
