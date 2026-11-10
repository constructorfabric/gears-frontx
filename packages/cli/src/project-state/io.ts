// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-atomic-project-state:p1
//
// Atomic read/write of the single repository-local project state document,
// `.frontx/project.json` (FEATURE §3 "Atomic Project State Read/Write").
// Pure logic only — no direct `fs` calls here; the injected
// `ReadProjectStateFn`/`WriteProjectStateFn` seams (`./types.ts`) are what a
// caller plugs a real filesystem adapter into (`adapters/fs-project-io.ts`),
// mirroring the `upgrade/`+`adapters/fs-project-io.ts`
// `ReadProjectFileFn`/`WriteProjectFileFn` split already established in this
// codebase. The one instruction this file does NOT implement,
// `inst-psio-write-atomic` (write to a temp file beside the destination,
// then rename into place), is the real adapter's own concern: this pure
// layer only knows it calls `writeProjectStateFn` and trusts the contract
// that call is atomic, exactly as `provenance/write.ts` trusts
// `ProvenanceWriteFn` without knowing how its real implementation persists.
import { getOwn } from '../own-record';
import { canonicalJson } from '../canonical-json';
import path from 'node:path';
import { hasControlChar, normalizeProjectRelativePath, unaddressableProjectPathReason } from '../paths/relative-path';
import { foldForIdentity } from '../paths/volume-case';
import { FRONTX_NAMESPACE_ROOT } from '../manifest/types';
import { isStrictDescendantOfTarget, isWellFormedExcludedSubtree } from '../manifest/validate-contract';
import type {
  MutateProjectStateResult,
  ProjectStateDocument,
  ProjectStateMutation,
  ReadProjectStateFn,
  ReadProjectStateResult,
  TemplateEntry,
  WriteProjectStateFn,
} from './types';

// @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-locate
/** The document's one location inside the repository root. */
export function projectStatePath(repoRoot: string): string {
  return path.join(repoRoot, FRONTX_NAMESPACE_ROOT, 'project.json');
}
// @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-locate

// The OLD per-template `.frontx/provenance.json` record — this feature's
// own header (`./types.ts`) says it is "slated for deletion once callers
// migrate" — is never itself read by this module's normal logic; it is
// referenced here ONLY so `loadProjectStateDocument` can detect the one
// combination ADR-0019 ("More Information") requires be refused rather than
// silently treated as an empty project: this legacy file present with no
// `.frontx/project.json` alongside it.
function legacyProvenancePath(repoRoot: string): string {
  return path.join(repoRoot, FRONTX_NAMESPACE_ROOT, 'provenance.json');
}

function initialProjectStateDocument(): ProjectStateDocument {
  return { formatVersion: 1, templates: {}, projectOwnedRoots: [] };
}

function isRecordShaped(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPreviousOriginShaped(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecordShaped(value) && typeof value.origin === 'string' && typeof value.version === 'string')
  );
}

// Guards a RECORDED `TemplateEntry.excludedSubtrees` value the IDENTICAL way
// a manifest's own `excludedSubtrees` declaration is guarded
// (`manifest/validate-contract.ts`'s `isWellFormedExcludedSubtree`/
// `isStrictDescendantOfTarget`, reused here rather than reformulated) —
// `cpt-frontx-dod-composed-provenance-contract-ownership`'s own text fixes
// this field as "the name's declared exclusions", the same fact the
// manifest contract's own category 3 already validates, so this store must
// never accept a shape that check would reject. `undefined` is valid — a
// document written before this field existed — but once present, every
// element must be a well-formed, strict-descendant-of-target path string:
// a bare non-array value, a non-string element, an empty string, or an
// element escaping the target makes the WHOLE entry malformed, exactly like
// an unrecognized `origin`/`version`/`targets` shape does below. Left
// unvalidated, a malformed value would reach `scaffold/delete-plan.ts`'s own
// recorded-value join (`inst-dp-else-if-recorded-exclusions`) as if it were
// a real declaration — confirmed live: a number there threw `is not
// iterable`, and an empty-string entry silently failed to protect anything,
// letting `delete` remove a developer's own file it was declared to
// preserve.
function isExcludedSubtreesShaped(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((entry) => isWellFormedExcludedSubtree(entry) && isStrictDescendantOfTarget(entry)))
  );
}

// `exclusionsBackfilled` is `true` or absent; any other value is malformed
// rather than coerced, since it decides whether a recorded declaration is
// trusted as history.
function isBackfillMarkerShaped(value: unknown): boolean {
  return value === undefined || value === true;
}

// `relinquishedGround` is a list of strings or absent; each entry's spelling is
// judged separately with the other recorded paths (`recordedPathSpellingViolation`).
function isRelinquishedGroundShaped(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
}

/**
 * The entry fields a build that predates them would IGNORE and DROP on its next
 * rewrite, and whose loss removes a protection (`exclusionsBackfilled` stops
 * telling the other judgements to distrust `excludedSubtrees`;
 * `relinquishedGround` and `provenExcludedSubtrees` stop preserving old files
 * and stop exempting nested templates): a build that does not know them
 * cannot keep them. Optional-and-additive alone is therefore not a safe
 * downgrade, only a version the older build REFUSES is.
 */
const PROTECTION_FIELDS = ['exclusionsBackfilled', 'relinquishedGround', 'provenExcludedSubtrees'] as const;

/**
 * The `formatVersion` a document must be written with: `2` exactly when some
 * entry carries a protection field, `1` otherwise. Derived from the content on
 * every write rather than remembered, so a project that never needed the
 * protection keeps a document every earlier build still reads, and one that
 * does is refused by a build that would have dropped it (`its formatVersion is
 * not 1`) before that build writes anything.
 */
export function requiredFormatVersion(document: ProjectStateDocument): 1 | 2 | 3 {
  // A recovery-bearing document is never lowered again (plan-ai-recovery r9 §2).
  if (document.formatVersion === 3 || Object.values(document.templates).some((entry) => entry.pendingPostCommit !== undefined)) {
    return 3;
  }
  const guarded = Object.values(document.templates).some((entry) =>
    PROTECTION_FIELDS.some((field) => entry[field] !== undefined),
  );
  return guarded ? 2 : 1;
}

function isTemplateEntryShaped(value: unknown): value is TemplateEntry {
  return (
    isRecordShaped(value) &&
    typeof value.origin === 'string' &&
    typeof value.version === 'string' &&
    Array.isArray(value.targets) &&
    value.targets.every((target) => typeof target === 'string') &&
    isPreviousOriginShaped(value.previous) &&
    isExcludedSubtreesShaped(value.excludedSubtrees) &&
    isBackfillMarkerShaped(value.exclusionsBackfilled) &&
    isRelinquishedGroundShaped(value.relinquishedGround) &&
    isExcludedSubtreesShaped(value.provenExcludedSubtrees) &&
    isPendingPostCommitShaped(value.pendingPostCommit)
  );
}

const TASK_STATUS = new Set<unknown>(['pending', 'done', 'not-required']);
const INTENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isPendingPostCommitShaped(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecordShaped(value) || typeof value.intentId !== 'string' || !INTENT_ID.test(value.intentId)) return false;
  if (!TASK_STATUS.has(value.inventory) || !TASK_STATUS.has(value.ai)) return false;
  const known = new Set(['intentId', 'inventory', 'ai', 'effects']);
  if (Object.keys(value).some((key) => !known.has(key))) return false;
  if (value.effects === undefined) return true;
  if (!isRecordShaped(value.effects)) return false;
  return Object.entries(value.effects).every(([key, hash]) => (key === 'inventory' || key === 'ai') && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash));
}

/**
 * Guards the top-level shape `{ formatVersion, templates, projectOwnedRoots
 * }` and every `templates[name]` entry within it (`inst-psio-if-malformed`).
 * Returns `null` — never throws — on any shape violation, so the caller can
 * turn that into `PROJECT_INVALID` naming the document rather than letting
 * an unrelated TypeError surface deeper in a caller that trusts the parsed
 * type, the same discipline `provenance/validate.ts` applies to the older
 * per-template store.
 */
type ParsedProjectState =
  | { ok: true; document: ProjectStateDocument }
  | { ok: false; reason: string; details?: Record<string, string> };

function parseProjectStateDocument(raw: string): ParsedProjectState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'its content is not valid JSON' };
  }
  if (!isRecordShaped(parsed)) return { ok: false, reason: 'its top level is not a JSON object' };
  // Exactly `1`, not merely a number: this store owns exactly one schema
  // generation today, and a document stamped with a future `formatVersion`
  // this build does not understand must be refused rather than silently
  // read (and, on a mutation, silently rewritten) as if it were the current
  // shape — a version comparison this narrow is the only thing that can
  // ever detect that mismatch, since every OTHER structural check below
  // would accept a same-shaped document regardless of which generation
  // wrote it.
  // Two generations are understood: `1` (no protection fields on any entry)
  // and `2` (at least one entry carries a downgrade-sensitive field, see
  // `requiredFormatVersion`). Every supported write stamps the version from the
  // content, so a `1` document that carries such a field is not a state this
  // build produces: it comes from an intermediate build of this branch, which
  // is outside the supported boundary, and is refused below rather than read
  // as it stands and re-stamped.
  if (parsed.formatVersion !== 1 && parsed.formatVersion !== 2 && parsed.formatVersion !== 3) {
    return { ok: false, reason: `its formatVersion is not 1, 2 or 3` };
  }
  if (!isRecordShaped(parsed.templates)) return { ok: false, reason: 'its templates field is not an object' };
  // The offending entry — and, for the one field with structure of its own,
  // which field — is named rather than folded into a single generic
  // sentence: this document is hand-editable, and a developer told only
  // that it "could not be parsed" has nowhere to start.
  for (const [name, entry] of Object.entries(parsed.templates)) {
    if (isTemplateEntryShaped(entry)) continue;
    const reason = isRecordShaped(entry) && !isExcludedSubtreesShaped(entry.excludedSubtrees)
      ? `templates["${name}"].excludedSubtrees is not a list of target-relative directory paths`
      : isRecordShaped(entry) && !isBackfillMarkerShaped(entry.exclusionsBackfilled)
        ? `templates["${name}"].exclusionsBackfilled is not true`
        : isRecordShaped(entry) && !isRelinquishedGroundShaped(entry.relinquishedGround)
          ? `templates["${name}"].relinquishedGround is not a list of project-relative paths`
          : isRecordShaped(entry) && !isExcludedSubtreesShaped(entry.provenExcludedSubtrees)
            ? `templates["${name}"].provenExcludedSubtrees is not a list of target-relative directory paths`
            : isRecordShaped(entry) && !isPendingPostCommitShaped(entry.pendingPostCommit)
              ? `templates["${name}"].pendingPostCommit is not a recognised post-commit record`
              : `templates["${name}"] is not a { origin, version, targets } entry`;
    return { ok: false, reason };
  }
  if (!Array.isArray(parsed.projectOwnedRoots) || !parsed.projectOwnedRoots.every((p) => typeof p === 'string')) {
    return { ok: false, reason: 'its projectOwnedRoots field is not a list of strings' };
  }
  // Pending post-commit work is a formatVersion-3 concept; it is never read from
  // an older stamp, and one intent belongs to exactly one entry.
  const intentIds = new Set<string>();
  for (const [name, entry] of Object.entries(parsed.templates as Record<string, TemplateEntry>)) {
    if (entry.pendingPostCommit === undefined) continue;
    if (parsed.formatVersion !== 3) {
      return { ok: false, reason: `templates["${name}"].pendingPostCommit is recorded in a document stamped formatVersion ${String(parsed.formatVersion)}` };
    }
    if (intentIds.has(entry.pendingPostCommit.intentId)) {
      return { ok: false, reason: `templates["${name}"].pendingPostCommit repeats an intent another entry already records` };
    }
    intentIds.add(entry.pendingPostCommit.intentId);
  }
  if (parsed.formatVersion === 1) {
    for (const [name, entry] of Object.entries(parsed.templates as Record<string, TemplateEntry>)) {
      const field = PROTECTION_FIELDS.find((candidate) => entry[candidate] !== undefined);
      if (field !== undefined) {
        return {
          ok: false,
          reason:
            `templates["${name}"].${field} is recorded in a document stamped formatVersion 1, ` +
            `which this build never writes (it stamps 2 whenever a protection field is present); ` +
            `such a document was written by an unsupported intermediate build`,
        };
      }
    }
  }
  const document: ProjectStateDocument = {
    formatVersion: parsed.formatVersion,
    templates: parsed.templates as Record<string, TemplateEntry>,
    projectOwnedRoots: parsed.projectOwnedRoots as string[],
  };
  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-noncanonical
  const spelling = recordedPathSpellingViolation(document);
  if (spelling !== undefined) return { ok: false, reason: spelling.clause, details: spelling.details };
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-noncanonical
  return { ok: true, document };
}

// The recorded paths — every `templates[name].targets[]` entry and every
// `projectOwnedRoots[]` entry — are the one input every engine (apply, delete,
// ownership, upgrade, validate) compares by SEGMENTS OF THE STRING it is
// handed. A recorded `x/../app/src` reads as ground outside `app/src` while the
// filesystem puts it inside, so an engine that judged it as written would treat
// a project-owned file as template ground. They are therefore judged ONCE, here,
// for every engine: each must already be its own normalised project-relative
// spelling, exactly what `apply` records (the canonicaliser's output) and what
// `ownership add` records. One that is not is refused naming the entry, never
// silently re-rooted — a hand-edited state file is a document nobody reviewed
// as the location it names.
//
// Returns the clause naming the first offending entry with its `details`, or
// `undefined`.
// What a person can do about a refused recorded path. No frontx command can
// correct it: every command loads this document first and refuses it (the
// fixing commands included), so the only way out is the entry in the file
// itself. Where the normalised spelling is a location inside the project it is
// named, with the caveat that normalising is lexical and does not resolve
// symlinks, so the person confirms it names the location they meant.
function spellingRepair(value: string): { hint: string; suggested?: string } {
  const normalized = hasOnlySpellingProblem(value) ? normalizeProjectRelativePath(value) : null;
  const where = '.frontx/project.json';
  return normalized !== null && normalized !== '' && normalized !== value
    ? {
        suggested: normalized,
        hint:
          ` No frontx command can correct it, because every command refuses a document holding it, unregister and ownership included. ` +
          `Edit ${where} by hand: replace ${JSON.stringify(value)} with ${JSON.stringify(normalized)} after confirming that is the location meant ` +
          `(the normalised spelling is lexical and does not resolve symlinks).`,
      }
    : {
        hint:
          ` No frontx command can correct it, because every command refuses a document holding it, unregister and ownership included. ` +
          `Edit ${where} by hand so the entry names a location inside the project, or remove it.`,
      };
}

function hasOnlySpellingProblem(value: string): boolean {
  return value.trim() === value && !hasControlChar(value);
}

function recordedPathSpellingViolation(
  document: ProjectStateDocument,
): { clause: string; details: Record<string, string> } | undefined {
  for (const [name, entry] of Object.entries(document.templates)) {
    for (const target of entry.targets) {
      const reason = unaddressableProjectPathReason(target);
      if (reason !== undefined) {
        const repair = spellingRepair(target);
        return {
          clause: `templates["${name}"].targets entry ${JSON.stringify(target)} ${reason}.${repair.hint}`,
          details: { name, target, ...(repair.suggested !== undefined ? { suggested: repair.suggested } : {}) },
        };
      }
    }
    for (const ground of entry.relinquishedGround ?? []) {
      const reason = unaddressableProjectPathReason(ground);
      if (reason !== undefined || ground === '.') {
        const repair = spellingRepair(ground);
        return {
          clause: `templates["${name}"].relinquishedGround entry ${JSON.stringify(ground)} ${reason ?? 'names the project root'}.${repair.hint}`,
          details: { name, target: ground, ...(repair.suggested !== undefined ? { suggested: repair.suggested } : {}) },
        };
      }
    }
  }
  for (const root of document.projectOwnedRoots) {
    const reason = unaddressableProjectPathReason(root);
    if (reason !== undefined) {
      const repair = spellingRepair(root);
      return {
        clause: `projectOwnedRoots entry ${JSON.stringify(root)} ${reason}.${repair.hint}`,
        details: { path: root, ...(repair.suggested !== undefined ? { suggested: repair.suggested } : {}) },
      };
    }
  }
  return undefined;
}

/**
 * Loads the current document, or the initial empty shape when none exists
 * yet — never writing anything for a mere load (`inst-psio-if-absent` /
 * `inst-psio-absent-default` / `inst-psio-if-present` / `inst-psio-read` /
 * `inst-psio-if-malformed` / `inst-psio-return-invalid`). Shared by both the
 * read-only entrypoint and the mutation entrypoint below, since both begin
 * by establishing the current document the same way.
 */
async function loadProjectStateDocument(
  repoRoot: string,
  readProjectStateFn: ReadProjectStateFn,
): Promise<{ ok: true; document: ProjectStateDocument } | { ok: false; message: string; details?: Record<string, string> }> {
  const location = projectStatePath(repoRoot);
  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-present
  const raw = await readProjectStateFn(location);
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-present

  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-absent
  if (raw === null) {
    // The absence of `.frontx/project.json` is deliberately NOT a failure on
    // its own — the marked default below stands for every ordinary empty
    // project. The ONE combination ADR-0019 ("More Information") requires be
    // refused instead is this absence PLUS a legacy `.frontx/
    // provenance.json` alongside it: a repository an older CLI version
    // created, never migrated to this single-document model. Guessing a
    // translation from that old per-template record is explicitly out of
    // scope; the developer recreates or re-registers instead.
    const legacyPath = legacyProvenancePath(repoRoot);
    const legacyRaw = await readProjectStateFn(legacyPath);
    if (legacyRaw !== null) {
      return {
        ok: false,
        message:
          `"${legacyPath}" is a legacy provenance record from an older CLI version; this repository was never ` +
          'migrated to the current .frontx/project.json model. Recreate the project or re-register its ' +
          'templates against the current model before running this command.',
      };
    }
    // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-absent-default
    return { ok: true, document: initialProjectStateDocument() };
    // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-absent-default
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-absent

  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-read
  const parsed = parseProjectStateDocument(raw);
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-read

  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-malformed
  if (!parsed.ok) {
    // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-return-invalid
    // The path is spelled project-relative, the one way every other refusal
    // in this package spells a path inside the project.
    const reported = path.relative(repoRoot, location) || location;
    return {
      ok: false,
      message: `Project state document at "${reported}" is not valid: ${parsed.reason}${parsed.reason.endsWith('.') ? '' : '.'}`,
      ...(parsed.details ? { details: parsed.details } : {}),
    };
    // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-return-invalid
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-malformed

  return { ok: true, document: parsed.document };
}

/**
 * A read-only request (`inst-psio-if-read` / `inst-psio-return-read`):
 * returns the current document (or the initial empty shape) and writes
 * nothing.
 */
export async function readProjectState(
  repoRoot: string,
  readProjectStateFn: ReadProjectStateFn,
): Promise<ReadProjectStateResult> {
  const loaded = await loadProjectStateDocument(repoRoot, readProjectStateFn);
  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-read
  if (!loaded.ok) {
    return { ok: false, error: 'PROJECT_INVALID', message: loaded.message, ...(loaded.details ? { details: loaded.details } : {}) };
  }
  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-return-read
  return { ok: true, document: loaded.document };
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-return-read
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-read
}

/**
 * Applies exactly one described mutation to an in-memory copy of the
 * current document and nothing else (`inst-psio-construct-copy`) — a pure
 * data transform, never a raw JSON patch.
 */
function applyMutation(document: ProjectStateDocument, mutation: ProjectStateMutation): ProjectStateDocument {
  switch (mutation.kind) {
    case 'set-template':
      return {
        ...document,
        templates: { ...document.templates, [mutation.name]: mutation.entry },
      };
    case 'remove-template': {
      const { [mutation.name]: _removed, ...rest } = document.templates;
      return { ...document, templates: rest };
    }
    case 'add-owned-root':
      // Case-folded per the project volume, not a bare `.includes` — the
      // same identity `commands/ownership.ts`'s own no-op check already
      // decides before ever constructing this mutation, re-checked here so
      // this pure transform cannot itself append a second spelling of one
      // already-owned ground for a caller that skips that check.
      return document.projectOwnedRoots.some((existing) => foldForIdentity(existing) === foldForIdentity(mutation.path))
        ? document
        : { ...document, projectOwnedRoots: [...document.projectOwnedRoots, mutation.path] };
    case 'remove-owned-root': {
      const recordedVerbatim =
        mutation.verbatim !== undefined &&
        document.projectOwnedRoots.some((existing) => foldForIdentity(existing) === foldForIdentity(mutation.verbatim!));
      const removed = recordedVerbatim ? mutation.verbatim! : mutation.path;
      return {
        ...document,
        projectOwnedRoots: document.projectOwnedRoots.filter(
          (existing) => foldForIdentity(existing) !== foldForIdentity(removed),
        ),
      };
    }
  }
}

/**
 * A described mutation (`inst-psio-if-mutate`): reads the current document,
 * constructs the fully modified copy reflecting exactly the described
 * change (`inst-psio-construct-copy`), and writes it back through the
 * injected `writeProjectStateFn` — trusted to write-through-temp-then-rename
 * (`inst-psio-write-atomic`, realized by the real adapter in
 * `adapters/fs-project-io.ts`, not by this pure-logic layer) — before
 * returning the written document (`inst-psio-return-written`).
 */
/**
 * The name whose pending post-commit record this mutation would create, change
 * or drop without being that record's own transition — or whose pending entry
 * it would otherwise alter. `undefined` when the mutation respects every pending
 * entry. Disjoint entries stay freely writable (r9 §4).
 */
function pendingPostCommitViolation(
  before: ProjectStateDocument,
  after: ProjectStateDocument,
  transitionIntentId: string | undefined,
): string | undefined {
  const names = new Set([...Object.keys(before.templates), ...Object.keys(after.templates)]);
  for (const name of names) {
    const was = getOwn(before.templates, name);
    const now = getOwn(after.templates, name);
    const owned = (entry: TemplateEntry | undefined) =>
      entry?.pendingPostCommit !== undefined && entry.pendingPostCommit.intentId === transitionIntentId;
    if (was?.pendingPostCommit !== undefined) {
      if (owned(was)) continue;
      if (canonicalJson(was) !== canonicalJson(now ?? null)) return name;
    } else if (now?.pendingPostCommit !== undefined && !owned(now)) {
      return name;
    }
  }
  return undefined;
}

export async function mutateProjectState(
  repoRoot: string,
  mutation: ProjectStateMutation,
  readProjectStateFn: ReadProjectStateFn,
  writeProjectStateFn: WriteProjectStateFn,
  // The one transition allowed to create, advance or clear a `pendingPostCommit`
  // (its recovery-record id); every other mutation leaves pending entries untouched.
  options: { transitionIntentId?: string } = {},
): Promise<MutateProjectStateResult> {
  const loaded = await loadProjectStateDocument(repoRoot, readProjectStateFn);
  if (!loaded.ok) {
    return { ok: false, error: 'PROJECT_INVALID', message: loaded.message, ...(loaded.details ? { details: loaded.details } : {}) };
  }

  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-mutate
  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-construct-copy
  const mutated = applyMutation(loaded.document, mutation);
  const pendingViolation = pendingPostCommitViolation(loaded.document, mutated, options.transitionIntentId);
  if (pendingViolation !== undefined) {
    return {
      ok: false,
      error: 'PROJECT_INVALID',
      message:
        `"${pendingViolation}" has unfinished post-commit work (pendingPostCommit); nothing was written. ` +
        `Run "frontx upgrade ${pendingViolation} --recover" first.`,
      details: { pendingPostCommit: pendingViolation },
    };
  }
  const nextDocument: ProjectStateDocument = { ...mutated, formatVersion: requiredFormatVersion(mutated) };
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-construct-copy

  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-record-noncanonical
  // The same judgement the load applies, on the document about to be WRITTEN:
  // a caller handing a non-canonical path to record is refused before the file
  // is touched, so the store never holds a spelling its own load would refuse.
  const spelling = recordedPathSpellingViolation(nextDocument);
  if (spelling !== undefined) {
    const reported = path.relative(repoRoot, projectStatePath(repoRoot)) || projectStatePath(repoRoot);
    return {
      ok: false,
      error: 'PROJECT_INVALID',
      message: `Refusing to write project state document "${reported}": ${spelling.clause}`,
      details: spelling.details,
    };
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-record-noncanonical

  const location = projectStatePath(repoRoot);
  await writeProjectStateFn(location, JSON.stringify(nextDocument, null, 2));

  // @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-return-written
  const removedPath =
    mutation.kind === 'remove-owned-root'
      ? loaded.document.projectOwnedRoots.find(
          (existing) => !nextDocument.projectOwnedRoots.includes(existing),
        )
      : undefined;
  return { ok: true, document: nextDocument, ...(removedPath === undefined ? {} : { removedPath }) };
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-return-written
  // @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-mutate
}
