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
//
// Deliberately a NEW directory, not `src/provenance/` — that directory holds
// the OLD per-template `.frontx/provenance.json` model (a SET of records,
// one per applied template, `provenance/types.ts`'s `ProvenanceRecord`),
// slated for deletion once callers migrate to this single-document model.
// The two are unrelated shapes that happen to share a similar name; keeping
// them in separate directories keeps that migration from confusing the two.

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
  /** The name's declared `excludedSubtrees`, recorded at register/upgrade
   * time so `scaffold/delete-plan.ts` never depends on the origin still
   * being resolvable to compute what is safe to delete — a vendored `path:`
   * origin folder is transient by design (`QUICK_START` §4 vendors it into
   * the project, and a developer may remove it once applied). OPTIONAL so
   * an existing document written before this field existed still parses;
   * an entry without it falls back to resolving the manifest live
   * (`cpt-frontx-algo-cli-scaffolding-delete-plan`'s own
   * `inst-dp-else-resolve-manifest`). Written by every path that creates or
   * replaces an entry (`commands/register.ts`), carried forward unchanged by
   * `commands/apply.ts` (re-recorded from the declaration the apply wrote
   * under when the entry had no applied target yet; otherwise carried forward,
   * or marked `exclusionsBackfilled` when that declaration differs), and re-recorded from the NEW payload's
   * own declaration by `upgrade/commit.ts` — an upgrade can narrow or widen
   * what a name excludes, and the recorded value must track whichever
   * origin is now actually registered. */
  excludedSubtrees?: string[];
  /** `true` when `excludedSubtrees` is NOT evidence of what the template
   * declared when it wrote its applied `targets[]`: either it was BACKFILLED
   * onto a legacy entry that already had applied targets (the CURRENT
   * manifest's declaration, copied in by a no-op `register`/`upgrade` that
   * touched no applied file), or a later `apply` wrote a further target under
   * a declaration that differs from the recorded one, which one per-name value
   * cannot describe alongside the earlier targets. (`apply` onto an entry with
   * no applied target records its own declaration instead, so a `register`-time
   * value never stands in for one: a `path:` manifest can change in between.)
   * Every consumer that treats the
   * recorded value as that evidence (the delete plan's other-owner ancestor
   * exemption, the upgrade alias judgement) reads it as absent. Never set on
   * an entry without applied targets (nothing was written yet), cleared by the
   * next `apply` onto such an entry, and carried forward by `upgrade/commit.ts` on every later upgrade or restore
   * (`UpgradePlan.priorHistoryUnproven`), since a later plan's empty skip list does not show that a
   * file left behind by an earlier relinquishing upgrade is gone; it is also SET there when the
   * candidate's declaration relinquishes a file the BASELINE payload listed inside the baseline
   * boundary, or declares an excluded subtree the entry did not record at apply over ground the disk holds
   * (`ClassifyResult.unprovenGroundPaths`; an origin edited in place no longer lists what it wrote)
   * (`UpgradePlan.relinquishesWrittenGround`). OPTIONAL; a document carrying it is stamped
   * `formatVersion` 2, since a build that predates it would drop the mark and read the
   * declaration as evidence again. */
  exclusionsBackfilled?: true;
  /** Project-relative ground (directory roots, canonical, no trailing separator)
   * that a MARKED entry (`exclusionsBackfilled`) declared excluded beneath one
   * of its targets, kept after the target is DELETED or the declaration is
   * narrowed. The mark guards an old file left in
   * relinquished ground only while the entry still has the target the ground
   * sits under; once `delete` removes that target the mark has nothing left to
   * guard, so `delete` records the ground here and every OTHER template's
   * delete plan keeps preserving what it finds beneath it (a nested template
   * applied there later, or an alias of it). Recorded when the entry is marked (the roots of the declarations that changed, or every declaration in play once the entry was already marked, under
   * every target, `project-state/retained-ground.ts`) as well as by `delete`, and never narrowed, so a later
   * declaration cannot take the location with it; the entry's own `delete` preserves what lies beneath, at or above its target.
   * Carried forward by every apply,
   * upgrade and restore of the entry; dropped only by `unregister` (`register --replace` carries it: it
   * records ground on disk, not lineage). Never
   * read as proof of authorship: it only widens what a deletion preserves.
   * OPTIONAL. A document carrying it is stamped `formatVersion` 2, so a build that
   * predates it refuses the document instead of dropping the field; a document without it
   * means "nothing retained". */
  relinquishedGround?: string[];
  /** Target-relative declarations (as `excludedSubtrees`, canonical, no
   * trailing separator) that EVERY write of this MARKED entry's files was made
   * under: the evidence, kept after the mark made `excludedSubtrees` useless as
   * evidence, that those regions were never the entry's ground, so a template
   * nested there is not an old file of the entry's (the upgrade's retained-ground
   * judgement, the delete plan's other-owner ancestor exemption).
   * Derived ONLY from recorded state at the moment an unmarked entry is marked
   * (`recorded ∩ declaration now in play`) and afterwards only NARROWED to what
   * each later apply, upgrade and restore also excluded
   * (`project-state/retained-ground.ts`); never read from the current origin's
   * manifest, which is mutable. Absent for a legacy or no-op-backfilled entry,
   * for one marked by a build that did not write it, and once nothing remains:
   * absent means "nothing proven", the conservative reading, and no later write
   * creates it. Cleared by the next `apply` onto an entry with no applied target.
   * OPTIONAL. A document carrying it is stamped `formatVersion` 2, so a build that
   * predates it refuses the document (`its formatVersion is not 1`) before it can
   * ignore the field and drop it on a rewrite. */
  provenExcludedSubtrees?: string[];
  /** Post-commit work of the upgrade/restore that produced this entry
   * (plan-ai-recovery r9 §2.3): written in the SAME atomic write as the new
   * origin/version, advanced only after an effect is verified (`done` carries
   * the verified effect hash), and removed only by verified finalization. While
   * present the transition is not complete: no noop/success may be reported for
   * the name and no ordinary writer may change this entry. A document carrying
   * it is stamped `formatVersion` 3. */
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
  /** `2` exactly when an entry carries `exclusionsBackfilled`, `relinquishedGround` or
   * `provenExcludedSubtrees` (a build that predates them would drop the protection they
   * record, so it must refuse the document), `1` otherwise; derived on every write
   * (`project-state/io.ts`'s `requiredFormatVersion`). `3` once an entry has carried
   * `pendingPostCommit`, and never lowered again (plan-ai-recovery r9 §2). */
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
