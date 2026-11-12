// @cpt-FEATURE:cpt-frontx-feature-composed-provenance:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-registration:p1
//
// `register <origin>` — cpt-frontx-algo-composed-provenance-register. Reads
// and writes the single project state document this feature owns
// (`../project-state/io.ts`) through the injected `ReadProjectStateFn`/
// `WriteProjectStateFn` seams, exactly as that module's own header requires:
// no direct filesystem access here.
//
// A remote origin's pin is supposed to be the exact immutable commit SHA the
// fetch settled on (`inst-cpreg-install`). The shared resolver
// (`resolver/resolve.ts`'s `inst-resolve-pin`) now settles that pin from the
// full 40-hex commit the GitHub archive's global PAX header states
// (`adapters/github-fetch.ts`) and records it as `source` before this
// command ever sees the result, so the resolver's `source`,
// which this command writes as `origin` below, already carries the
// immutable SHA end to end for a GitHub origin — this command performs no
// pinning of its own; it simply passes through what the resolver settled.
// The GitHub adapter refuses an archive that states no commit. The residual,
// honestly-unpinned case is an injected fetch adapter that reports no pin (the
// test-only local-source hook, or a library caller's own): `origin` there is
// still the typed, possibly-moving reference.
//
// A `path:<relative-path>` origin is resolved through the SAME shared
// resolver a remote origin goes through
// (`cpt-frontx-algo-template-resolution-resolve-to-inventory`), never
// through the local inventory: a local origin has no separate publication to
// resolve to an immutable form, so it is never installed/tracked there — the
// resolver's own containment, existence, and manifest-identity checks are
// the only checks a local origin gets. No fetch, no pin — there is nothing
// external to pin against.
import { readManifestFromContent } from '../manifest/validate-contract';
import { readProjectState, mutateProjectState } from '../project-state/io';
import { bundleOverlapMessage, overlappingBundleNames } from '../project-state/bundle-identity';
import { exclusionGroundRoots, withRetainedGround } from '../project-state/retained-ground';
import type { ReadProjectStateFn, WriteProjectStateFn, TemplateEntry } from '../project-state/types';
import { resolveToInventory } from '../resolver/resolve';
import { parseLocalOrigin } from '../resolver/types';
import { parseSourceSpec } from '../spec-parser/parse';
import type { FetchFn, ListFolderFilesFn, PathExistsFn } from '../resolver/types';
import type { ReadFolderFileBinaryFn } from '../resolver/types';
import type { InventoryEntry, InventoryResult } from '../inventory/types';
import type { CanonicalizeTargetFn } from '../scaffold/conflict-check';
import type { ErrorCode } from '../envelope';
import { getOwn } from '../own-record';

// Narrow port over `TemplateInventory` — register needs only these two
// methods: `install` is the ONE inventory write, run after every refusal
// gate passed, and `lookup` reads the slot back to confirm it holds the
// source the gates checked. The manifest itself comes from the shared
// resolver's in-memory acquisition (never from `lookup`), which enforces the
// four-field contract before this command sees the content, so this
// algorithm's own `inst-cpreg-if-invalid-manifest` step is unreachable in
// practice; it stays because the FEATURE spec names it as this algorithm's
// own step, not the resolver's.
export interface RegisterInventoryPort {
  install(spec: string, fetchFn: FetchFn): Promise<InventoryResult<{ name: string; ref: string }>>;
  lookup(name: string): InventoryEntry | undefined;
}

export type RegisterOutcome =
  | { ok: true; outcome: 'created' | 'noop' | 'recorded' | 'replaced'; name: string; entry: TemplateEntry }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

interface ResolvedOrigin {
  storedOrigin: string;
  manifestContent: string;
  // The one-shot install of a REMOTE origin, run only after every refusal
  // gate passed (reviewer finding, PR #614 comment 4540899403: a refused
  // registration must not touch the shared inventory slot/content/index).
  // `undefined` for a local origin, which is never installed.
  commit?: (name: string) => Promise<{ ok: false; code: ErrorCode; message: string } | undefined>;
}

// Replays the one fetch the in-memory resolution already made, so the later
// install pins to the very bytes the gates checked (a branch that moved
// between two fetches would otherwise register one thing and store another).
function fetchOnce(fetchFn: FetchFn): FetchFn {
  const seen = new Map<string, ReturnType<FetchFn>>();
  return (url) => {
    let hit = seen.get(url);
    if (hit === undefined) {
      hit = fetchFn(url);
      seen.set(url, hit);
    }
    return hit;
  };
}

async function resolveOrigin(
  origin: string,
  repoRoot: string,
  inventory: RegisterInventoryPort,
  fetchFn: FetchFn,
  readFolderFileBinaryFn: ReadFolderFileBinaryFn,
  canonicalizeFn: CanonicalizeTargetFn,
  existsFn: PathExistsFn,
  listFolderFilesFn: ListFolderFilesFn,
): Promise<{ ok: true; value: ResolvedOrigin } | { ok: false; message: string; code?: ErrorCode; details?: Record<string, unknown> }> {
  if (parseLocalOrigin(origin) !== undefined) {
    // The shared resolver now owns containment, existence, and manifest-
    // identity/legacy-manifest checking for a local origin, exactly as it
    // already does for a remote one — a local origin is resolved directly
    // (never through `TemplateInventory.install`/`lookup`), since it has no
    // separate publication to install or pin: the resolver reads the
    // folder's own current content at every resolution.
    const resolved = await resolveToInventory(
      { kind: 'local', origin },
      {
        fetchFn,
        local: {
          repoRoot,
          canonicalizeFn,
          existsFn,
          listFolderFilesFn,
          readFolderFileBinaryFn,
        },
      },
    );
    if (!resolved.ok) {
      return {
        ok: false,
        code: resolved.error.code,
        message: `Register refused: local origin "${origin}" could not be resolved: ${resolved.error.message} Use an existing template directory inside the project root (not the root itself) with a valid manifest, then retry register.`,
      };
    }
    // Recorded EXACTLY as given (`inst-cpreg-install`'s local-origin
    // clause) — no pin, since there is nothing external to pin against.
    // `manifestContent` is the resolver's acquired content (a bundle
    // envelope for a multi-file local folder); `readManifestFromContent`
    // below already unwraps that shape transparently, so this caller's own
    // subsequent manifest-field check works unchanged for either origin kind.
    return { ok: true, value: { storedOrigin: resolved.value.source, manifestContent: resolved.value.content } };
  }

  // The remote origin is resolved IN MEMORY first — the same acquisition
  // `TemplateInventory.install` runs, minus its write — so every project
  // gate below sees the pinned source and manifest while the shared inventory
  // is still untouched. `commit` performs the real install (a repeat is a
  // refresh: `TemplateInventory.ts`'s `sameTemplate` branch) only once the
  // caller has passed every refusal; the install's own collision guard still
  // applies there.
  const parsed = parseSourceSpec(origin);
  if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', message: parsed.error.message };
  const once = fetchOnce(fetchFn);
  const resolved = await resolveToInventory({ kind: 'remote', ref: parsed.value }, { fetchFn: once });
  if (!resolved.ok) {
    // The code travels, exactly as the local branch above already propagates
    // it: a manifest refused with `INVALID_MANIFEST` must not reach the caller
    // as `ORIGIN_UNAVAILABLE`, saying the origin could not be reached when it
    // had been reached and read.
    return {
      ok: false,
      code: resolved.error.code,
      message: resolved.error.message,
      ...(resolved.error.undeclaredFields ? { details: { undeclaredFields: resolved.error.undeclaredFields } } : {}),
    };
  }
  const { source, content } = resolved.value;
  const commit = async (name: string): Promise<{ ok: false; code: ErrorCode; message: string } | undefined> => {
    const installResult = await inventory.install(origin, once);
    if (!installResult.ok) {
      return { ok: false, code: installResult.error.code ?? 'ORIGIN_UNAVAILABLE', message: installResult.error.message };
    }
    const entry = inventory.lookup(name);
    if (entry?.source !== source) {
      return {
        ok: false,
        code: 'CONTENT_CONFLICT',
        message:
          `Installed template "${name}" reads back from the local inventory as "${entry?.source ?? 'absent'}", ` +
          `not the resolved "${source}"; the registration was not recorded.`,
      };
    }
    return undefined;
  };
  return { ok: true, value: { storedOrigin: source, manifestContent: content, commit } };
}

/**
 * cpt-frontx-algo-composed-provenance-register — resolves/installs `origin`,
 * validates its manifest, and creates, no-ops, replaces, or refuses the
 * project's `templates[name]` entry. Writes nothing on any failure path.
 */
export async function registerTemplate(
  origin: string,
  replace: boolean,
  repoRoot: string,
  inventory: RegisterInventoryPort,
  fetchFn: FetchFn,
  readFolderFileBinaryFn: ReadFolderFileBinaryFn,
  canonicalizeFn: CanonicalizeTargetFn,
  readProjectStateFn: ReadProjectStateFn,
  writeProjectStateFn: WriteProjectStateFn,
  existsFn: PathExistsFn,
  listFolderFilesFn: ListFolderFilesFn,
): Promise<RegisterOutcome> {
  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-accept
  // `origin` is accepted as this function's own parameter.
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-accept

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-install
  // This call's pinning guarantee is only as strong as whichever `fetchFn`
  // the caller injected: an adapter reporting no pin yields an
  // honestly-unpinned `origin` here. That holds of every seam in this
  // package, and the instruction describes what the system does — the one
  // production adapter the CLI wires (`createGithubFetchFn`) pins to the
  // commit its own tarball settled on, verified end-to-end against a real
  // remote where a branch name came back recorded as a SHA.
  //
  // The fetch runs unconditionally — never gated behind an `IF the origin's
  // content is not already available in the local inventory` check —
  // because such a conditional cannot stand beside its own pinning
  // requirement: what a project stores is never the typed ref but the value
  // the fetch settled on (`cpt-frontx-adr-source-spec-syntax`), so skipping
  // the fetch because content happens to be present locally would leave
  // nothing to pin, and a branch that had moved would register as a no-op.
  // The inventory WRITE, by contrast, is deferred (`ResolvedOrigin.commit`)
  // until every refusal below has passed: a refused registration leaves the
  // shared inventory slot, content and index exactly as they were. A repeat
  // on a success path is a refresh.
  const resolved = await resolveOrigin(
    origin,
    repoRoot,
    inventory,
    fetchFn,
    readFolderFileBinaryFn,
    canonicalizeFn,
    existsFn,
    listFolderFilesFn,
  );
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-install

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-install-fail
  if (!resolved.ok) {
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-unavailable
    return { ok: false, code: resolved.code ?? 'ORIGIN_UNAVAILABLE', message: resolved.message, ...(resolved.details ? { details: resolved.details } : {}) };
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-unavailable
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-install-fail

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-read-manifest
  const manifestResult = readManifestFromContent(resolved.value.manifestContent);
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-read-manifest

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-invalid-manifest
  const fields = readManifestFields(manifestResult, resolved.value.manifestContent);
  if (!fields.ok) {
    if (fields.reason === 'legacy-manifest') {
      // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-invalid-manifest
      // A legacy-shaped manifest is refused the same way here as at install
      // (`resolver/resolve.ts`'s `inst-resolve-if-legacy-manifest`): naming
      // every undeclared field present, never folded into the generic
      // missing-field message below.
      return {
        ok: false,
        code: 'INVALID_MANIFEST',
        message:
          'Registration refused — the resolved manifest declares field(s) not part of the four-field ' +
          `contract: ${fields.undeclaredFields.join(', ')}.`,
        details: { undeclaredFields: fields.undeclaredFields },
      };
      // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-invalid-manifest
    }
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-invalid-manifest
    return {
      ok: false,
      code: 'INVALID_MANIFEST',
      message: `Registration refused — the resolved manifest is missing or has an empty "${fields.field}" field.`,
      details: { field: fields.field },
    };
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-invalid-manifest
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-invalid-manifest

  const { name, version } = fields;
  // Every refusal below precedes this: the shared inventory is written only on
  // a success path, immediately before the project write it belongs with.
  const commitInventory = async () => (resolved.value.commit ? resolved.value.commit(name) : undefined);

  // The declared `excludedSubtrees` recorded onto the entry — read from the
  // SAME `manifestResult` `inst-cpreg-read-manifest` already produced above,
  // never a second parse. `manifestResult.ok` is guaranteed true here in
  // every real path (`readManifestFields`'s own doc comment: its raw-JSON
  // fallback branch is dead through the real resolver, which already runs
  // the identical four-field contract check before `resolveOrigin` can ever
  // return success); `[]` covers that unreachable-in-practice branch rather
  // than adding a third read. Recorded so `scaffold/delete-plan.ts` never
  // has to re-resolve this name's origin to learn what it excludes
  // (`cpt-frontx-algo-cli-scaffolding-delete-plan`'s own
  // `inst-dp-if-recorded-exclusions`) — a vendored `path:` origin folder is
  // transient by design and may no longer exist by the time a target under
  // it is deleted.
  const excludedSubtrees = manifestResult.ok ? manifestResult.manifest.excludedSubtrees : [];

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-read-state
  const stateResult = await readProjectState(repoRoot, readProjectStateFn);
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-read-state
  if (!stateResult.ok) {
    return { ok: false, code: 'PROJECT_INVALID', message: stateResult.message, ...(stateResult.details ? { details: stateResult.details } : {}) };
  }

  const existing = getOwn(stateResult.document.templates, name);

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-new
  if (existing === undefined) {
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap
    const overlap = bundleOverlapRefusal(stateResult.document.templates, name);
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-bundle-overlap
    if (overlap !== undefined) return overlap;
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-bundle-overlap
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap
    const entry: TemplateEntry = { origin: resolved.value.storedOrigin, version, targets: [], excludedSubtrees };
    const installFailure = await commitInventory();
    if (installFailure) return installFailure;
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-write-new
    const written = await mutateProjectState(
      repoRoot,
      { kind: 'set-template', name, entry },
      readProjectStateFn,
      writeProjectStateFn,
    );
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-write-new
    if (!written.ok) return { ok: false, code: 'PROJECT_INVALID', message: written.message, ...(written.details ? { details: written.details } : {}) };
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-created
    // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-unreg-to-empty
    return { ok: true, outcome: 'created', name, entry };
    // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-unreg-to-empty
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-created
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-new

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-else-exists
  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-same-origin
  if (existing.origin === resolved.value.storedOrigin) {
    const installFailure = await commitInventory();
    if (installFailure) return installFailure;
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-noop-missing-exclusions
    // A no-op for the pair {origin, version} is not a no-op for a document
    // missing a field this code now writes: a legacy entry registered
    // before `excludedSubtrees` existed has no recorded declaration at all,
    // and there is no other write path that will ever give it one short of
    // `upgrade` actually changing the origin. Confirmed live as the
    // recovery path a developer is told to run
    // (`scaffold/delete-plan.ts`'s own refusal message names exactly this
    // command) that silently did nothing: `register --replace` against the
    // same origin reported `{"outcome":"noop"}` and the field stayed
    // absent. Recording it here — from the SAME already-resolved manifest
    // read above, never a second parse — closes that loop.
    if (existing.excludedSubtrees === undefined) {
      // With applied targets the value is the CURRENT declaration, not what
      // was in force when those files were written: mark it so no consumer
      // reads it as history (`TemplateEntry.exclusionsBackfilled`).
      const repaired: TemplateEntry =
        existing.targets.length > 0
          ? withRetainedGround(
              { ...existing, excludedSubtrees, exclusionsBackfilled: true as const },
              exclusionGroundRoots(existing.targets, excludedSubtrees),
            )
          : { ...existing, excludedSubtrees };
      // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-write-noop-exclusions
      const writtenNoop = await mutateProjectState(
        repoRoot,
        { kind: 'set-template', name, entry: repaired },
        readProjectStateFn,
        writeProjectStateFn,
      );
      // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-write-noop-exclusions
      if (!writtenNoop.ok) return { ok: false, code: 'PROJECT_INVALID', message: writtenNoop.message, ...(writtenNoop.details ? { details: writtenNoop.details } : {}) };
      // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-empty
      // Reported as its own outcome, never as `noop`: the document was
      // written, and an envelope that says nothing happened after a write
      // is not a description a caller can act on.
      return { ok: true, outcome: 'recorded', name, entry: repaired };
      // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-empty
    }
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-noop-missing-exclusions
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-noop
    // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-empty
    return { ok: true, outcome: 'noop', name, entry: existing };
    // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-empty
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-noop
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-same-origin

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-no-replace
  if (!replace) {
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-origin-conflict
    return {
      ok: false,
      code: 'REGISTRATION_CONFLICT',
      message:
        `Template "${name}" is already registered from "${existing.origin}"; ` +
        `"${resolved.value.storedOrigin}" was not registered. Pass --replace to replace it.`,
      details: { name, currentOrigin: existing.origin, requestedOrigin: resolved.value.storedOrigin },
    };
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-origin-conflict
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-no-replace

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-replace-applied
  if (existing.targets.length > 0) {
    // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-replace-refused
    return {
      ok: false,
      code: 'TARGETS_EXIST',
      message:
        `Template "${name}" has applied targets; register --replace never changes the origin of a name ` +
        'with at least one applied target. Run "upgrade" instead.',
      details: { name, targets: existing.targets },
    };
    // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-replace-refused
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-replace-applied

  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-else-replace-ok
  // `previous` is deliberately omitted from the replacement entry — this is
  // the whole point of `--replace`: it starts a new lineage for the name, so
  // any `previous: {origin, version}` pair the entry carried from an
  // earlier upgrade/restore must not survive it.
  // Ground the entry relinquished (`relinquishedGround`) is about what lies on
  // disk, not about origin lineage, so it is carried: replace is the route the
  // CLI itself names once the last target is deleted, and dropping it would let
  // a later nested template's delete remove the old file.
  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap-replace
  const replaceOverlap = bundleOverlapRefusal(stateResult.document.templates, name);
  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-bundle-overlap-replace
  if (replaceOverlap !== undefined) return replaceOverlap;
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-bundle-overlap-replace
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-if-bundle-overlap-replace
  const installFailure = await commitInventory();
  if (installFailure) return installFailure;
  const replacedEntry: TemplateEntry = {
    origin: resolved.value.storedOrigin,
    version,
    targets: existing.targets,
    excludedSubtrees,
    ...(existing.relinquishedGround !== undefined ? { relinquishedGround: existing.relinquishedGround } : {}),
  };
  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-write-replace
  const writtenReplace = await mutateProjectState(
    repoRoot,
    { kind: 'set-template', name, entry: replacedEntry },
    readProjectStateFn,
    writeProjectStateFn,
  );
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-write-replace
  if (!writtenReplace.ok) return { ok: false, code: 'PROJECT_INVALID', message: writtenReplace.message, ...(writtenReplace.details ? { details: writtenReplace.details } : {}) };
  // @cpt-begin:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-replaced
  // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-empty
  return { ok: true, outcome: 'replaced', name, entry: replacedEntry };
  // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-empty
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-return-replaced
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-else-replace-ok
  // @cpt-end:cpt-frontx-algo-composed-provenance-register:p1:inst-cpreg-else-exists
}

// A registration whose AI-bundle directory (`.frontx/ai/<name>/`) equals,
// contains, or is contained by another registered name's is refused before
// anything is written: the bundle step clears and removes that directory
// recursively and by name, so one template's refresh or delete would take the
// other's materialized bundle with it (`project-state/bundle-identity.ts`).
function bundleOverlapRefusal(
  templates: Readonly<Record<string, TemplateEntry>>,
  name: string,
): { ok: false; code: ErrorCode; message: string; details: Record<string, unknown> } | undefined {
  const overlapping = overlappingBundleNames(templates, name);
  if (overlapping.length === 0) return undefined;
  return {
    ok: false,
    code: 'REGISTRATION_CONFLICT',
    message: bundleOverlapMessage(name, overlapping, `Template "${name}" was not registered`),
    details: { name, overlapping },
  };
}

type ManifestFieldsOutcome =
  | { ok: true; name: string; version: string }
  | { ok: false; reason: 'missing-field'; field: 'name' | 'version' | 'description' }
  | { ok: false; reason: 'legacy-manifest'; undeclaredFields: string[] };

/**
 * Extracts `name`/`version` (and confirms `description` is non-empty) from
 * the resolved manifest — this algorithm's own three fields
 * (`inst-cpreg-read-manifest` / `inst-cpreg-if-invalid-manifest`), decoupled
 * from `readManifestFromContent`'s FULL four-field contract check: an
 * `excludedSubtrees` violation is not this algorithm's concern at all
 * (register never inspects that field), so a manifest failing ONLY on that
 * field must not be reported as a missing `name`.
 *
 * When `readManifestFromContent` already succeeded, its manifest object is
 * used directly — every field is already guaranteed present and non-empty
 * by that contract, so no branch below can actually fire, but the checks
 * stay as the defensive, spec-named steps rather than an unchecked
 * destructure. When it failed on the legacy-manifest refusal
 * (`readManifestFromContent`'s own `refuseLegacyManifest` wiring), that
 * refusal is surfaced as-is — a legacy-shaped manifest is never re-parsed
 * for name/version below, since the refusal already stands regardless of
 * whether those three fields happen to be usable. Any OTHER read failure
 * falls back to a direct parse of the raw manifest text, which is now dead
 * in practice for BOTH origin kinds: the shared resolver
 * (`cpt-frontx-algo-template-resolution-resolve-to-inventory`) already runs
 * the identical four-field contract check before `resolveOrigin` above can
 * ever return success, for a local origin exactly as it always has for a
 * remote one via `TemplateInventory.install`. The check stays here anyway,
 * unreachable through the real pipeline, because a test double can construct
 * a `RegisterInventoryPort`/local resolution whose content already drifted
 * out of contract without depending on the resolver internals — see this
 * function's own call site for that fixture pattern.
 */
function readManifestFields(
  manifestResult: ReturnType<typeof readManifestFromContent>,
  rawManifestContent: string,
): ManifestFieldsOutcome {
  if (manifestResult.ok) {
    const { name, version, description } = manifestResult.manifest;
    if (!name) return { ok: false, reason: 'missing-field', field: 'name' };
    if (!version) return { ok: false, reason: 'missing-field', field: 'version' };
    if (!description || description.trim() === '') return { ok: false, reason: 'missing-field', field: 'description' };
    return { ok: true, name, version };
  }

  if (manifestResult.code === 'INVALID_MANIFEST' && manifestResult.undeclaredFields !== undefined) {
    return { ok: false, reason: 'legacy-manifest', undeclaredFields: manifestResult.undeclaredFields };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawManifestContent);
  } catch {
    return { ok: false, reason: 'missing-field', field: 'name' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'missing-field', field: 'name' };
  }
  const obj = parsed as Record<string, unknown>;
  const name = obj.name;
  if (typeof name !== 'string' || name.trim() === '') return { ok: false, reason: 'missing-field', field: 'name' };
  const version = obj.version;
  if (typeof version !== 'string' || version.trim() === '') return { ok: false, reason: 'missing-field', field: 'version' };
  const description = obj.description;
  if (typeof description !== 'string' || description.trim() === '') return { ok: false, reason: 'missing-field', field: 'description' };
  return { ok: true, name, version };
}

export interface ResolvedRegistrationCandidate {
  storedOrigin: string;
  name: string;
  version: string;
}

/**
 * Resolves and validates `origin` through the IDENTICAL `resolveOrigin` /
 * `readManifestFields` steps `registerTemplate` above uses, but reads and
 * writes no project state at all — a pure availability probe. `seed`
 * (`commands/seed-repository.ts`) calls this for every batch entry BEFORE
 * its own first write to `.frontx/project.json`, so a batch naming an
 * official default that cannot actually be resolved is refused with the
 * directory left exactly as it was found, rather than discovered only after
 * `seed` has already created the document that a later step then fails to
 * finish populating.
 */
export async function probeRegistration(
  origin: string,
  repoRoot: string,
  inventory: RegisterInventoryPort,
  fetchFn: FetchFn,
  readFolderFileBinaryFn: ReadFolderFileBinaryFn,
  canonicalizeFn: CanonicalizeTargetFn,
  existsFn: PathExistsFn,
  listFolderFilesFn: ListFolderFilesFn,
): Promise<
  | { ok: true; value: ResolvedRegistrationCandidate }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> }
> {
  const resolved = await resolveOrigin(
    origin,
    repoRoot,
    inventory,
    fetchFn,
    readFolderFileBinaryFn,
    canonicalizeFn,
    existsFn,
    listFolderFilesFn,
  );
  if (!resolved.ok) {
    return { ok: false, code: resolved.code ?? 'ORIGIN_UNAVAILABLE', message: resolved.message, ...(resolved.details ? { details: resolved.details } : {}) };
  }

  const fields = readManifestFields(readManifestFromContent(resolved.value.manifestContent), resolved.value.manifestContent);
  if (!fields.ok) {
    if (fields.reason === 'legacy-manifest') {
      return {
        ok: false,
        code: 'INVALID_MANIFEST',
        message:
          'The resolved manifest declares field(s) not part of the four-field contract: ' +
          `${fields.undeclaredFields.join(', ')}.`,
        details: { undeclaredFields: fields.undeclaredFields },
      };
    }
    return {
      ok: false,
      code: 'INVALID_MANIFEST',
      message: `The resolved manifest is missing or has an empty "${fields.field}" field.`,
      details: { field: fields.field },
    };
  }

  return {
    ok: true,
    value: { storedOrigin: resolved.value.storedOrigin, name: fields.name, version: fields.version },
  };
}
