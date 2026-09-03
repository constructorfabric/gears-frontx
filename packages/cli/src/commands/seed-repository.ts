// @cpt-FEATURE:cpt-frontx-feature-cli-scaffolding:p1
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-seed-repository:p1
//
// REWRITE (checkpoint 3): the prior `seedRepository` resolved a preset tree
// through `resolveComposition`, staged it through the OLD `uniformApply`
// (templateRef[] against the legacy ownership shape), and materialized via
// `materializeAssembly` — none of which exist in the current model. The
// CURRENT `seed` refuses a directory that already carries a
// `.frontx/project.json` (never an empty-target directory check — that
// concept is retired: existing on-disk content is now judged generically,
// for every unrecorded target, by existing-content reconciliation, exactly
// as `apply` judges it), creates the initial empty project state document,
// auto-registers each batch entry naming one of the CLI's official default
// templates (`./official-defaults.ts` — see that file's own header for the
// scope decision this checkpoint made, since no such list existed anywhere
// in this codebase before this developer wrote it), and then applies the
// batch through the IDENTICAL mechanism `apply` uses
// (`./apply.ts`'s `runApplyPipeline`) — never a second, independently
// duplicated materialize/reconcile/record sequence.
import path from 'node:path';
import { registerTemplate, probeRegistration } from './register';
import { officialDefaultOrigin } from './official-defaults';
import { runApplyPipeline } from './apply';
import type { ApplyBatchOutcome, ApplyBatchTargetRef, ApplyPipelineDeps } from './apply';
import type { UniformApplyBatch } from '../scaffold/assembler';
import { projectStatePath } from '../project-state/io';
import type { ProjectStateDocument } from '../project-state/types';
import type { RemoveProjectFileFn } from '../upgrade/types';
import type { ErrorCode } from '../envelope';

// DEFECT FIX (PR review, reproduced against the built binary): removes the
// directory at `absolutePath` only when it exists and is now completely
// empty — a no-op when it is absent, or genuinely non-empty (never a
// forced/recursive removal). The one capability `seedRepository`'s own
// rollback (`inst-seed-rollback` below) needs that no existing seam
// provides: every other project-state seam either reads/writes the ONE
// `.frontx/project.json` FILE (`ReadProjectStateFn`/`WriteProjectStateFn`)
// or removes a single file (`RemoveProjectFileFn`, reused as-is below for
// that document itself) — none of them can remove the `.frontx` DIRECTORY
// `seed`'s own first write may have brought into being as a side effect.
// Real implementation wired at the `cli.ts` dispatch site, exactly as every
// other seam here is.
export type RemoveEmptyDirFn = (absolutePath: string) => Promise<void>;

export type SeedRepositoryDeps = ApplyPipelineDeps & {
  // Reused as-is (`adapters/fs-project-io.ts`'s `createFsRemoveProjectFileFn`,
  // already wired into `CliDeps` as `removeProjectFile` for `delete`/
  // `upgrade`'s own restores) — this is a plain "remove this one file" seam,
  // and `.frontx/project.json` is exactly that.
  removeProjectFileFn: RemoveProjectFileFn;
  removeEmptyDirFn: RemoveEmptyDirFn;
};

export type SeedRepositoryOutcome =
  | { ok: true; registeredDefaults: string[]; applied: ApplyBatchTargetRef[]; noop: ApplyBatchTargetRef[] }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

// The literal initial shape `project-state/io.ts`'s own (unexported)
// `initialProjectStateDocument` constructs — restated here rather than
// imported (that module owns the schema and is finished this checkpoint;
// this developer takes no fresh dependency on its private helper for a
// three-field literal this stable). `inst-seed-create-project-state` cites
// `cpt-frontx-algo-composed-provenance-project-state-io` by name for exactly
// this shape.
function initialProjectStateDocument(): ProjectStateDocument {
  return { formatVersion: 1, templates: {}, projectOwnedRoots: [] };
}

// @cpt-dod:cpt-frontx-dod-cli-scaffolding-uniform-apply:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-ai-bundle:p1
/**
 * cpt-frontx-flow-cli-scaffolding-seed-repository — seeds `dir` with a fresh
 * `.frontx/project.json`, auto-registers every official-default template
 * named in `batch`, then applies `batch` through the identical mechanism
 * `apply` uses.
 */
export async function seedRepository(
  dir: string,
  batch: UniformApplyBatch,
  adoptExisting: boolean,
  deps: SeedRepositoryDeps,
): Promise<SeedRepositoryOutcome> {
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-invoke
  // `dir`/`batch` are accepted as this function's own parameters, naming in
  // the batch the official default templates to apply.
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-invoke

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-already-seeded
  const existingRaw = await deps.readProjectStateFn(projectStatePath(dir));
  if (existingRaw !== null) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-already-seeded
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: `"${dir}" already carries a project state document; a project once seeded is extended through ` +
        '"apply", never re-seeded.',
      details: { dir },
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-already-seeded
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-already-seeded

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-preflight-defaults
  // Resolve and validate every batch entry named against the CLI's official
  // defaults BEFORE the first write below (`inst-seed-create-project-state`),
  // so a batch naming a default that cannot actually be resolved is refused
  // with the directory left EXACTLY as it was found — never a
  // `.frontx/project.json` this same directory's next `seed` call would then
  // be permanently refused for (`inst-seed-if-already-seeded` above refuses
  // any directory that already carries one). Nothing here writes anything; a
  // failure here leaves no state to undo, which is why this runs first
  // rather than as a rollback after `inst-seed-create-project-state`/
  // `inst-seed-register-default` below have already run.
  for (const name of Object.keys(batch.templates)) {
    const origin = officialDefaultOrigin(name);
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-preflight-fail
    if (origin === undefined) {
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-preflight-fail
      return {
        ok: false,
        code: 'TEMPLATE_NOT_REGISTERED',
        message:
          `Seed aborted — "${name}" is not one of the CLI's official default templates. Register it yourself ` +
          '(this creates ".frontx/project.json" on its own first mutation if it does not exist yet, exactly as ' +
          'seed itself would have) and then "apply" it; nothing written.',
        details: { name },
      };
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-preflight-fail
    }
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-preflight-fail

    const probe = await probeRegistration(
      origin,
      dir,
      deps.inventory,
      deps.fetchFn,
      deps.readFileFn,
      deps.canonicalizeFn,
      deps.existsFn,
      deps.listFolderFilesFn,
    );
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-preflight-fail
    if (!probe.ok) {
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-preflight-fail
      return {
        ok: false,
        code: probe.code,
        message:
          `Seed aborted — official default "${name}" (origin "${origin}") could not be registered: ` +
          `${probe.message}; nothing written.`,
        details: { name, origin },
      };
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-preflight-fail
    }
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-preflight-fail
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-preflight-defaults

  // ROLLBACK GROUND: `.frontx` may not exist at all yet — captured BEFORE
  // the write immediately below is the only way to later tell "`seed` itself
  // created this directory" apart from "this directory was already here for
  // some other reason" (`inst-seed-rollback`'s own qualifier: remove it only
  // when `seed` created it AND it is now empty).
  const frontxDir = path.dirname(projectStatePath(dir));
  const frontxDirPreexisted = await deps.existsFn(frontxDir);

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-create-project-state
  await deps.writeProjectStateFn(projectStatePath(dir), JSON.stringify(initialProjectStateDocument(), null, 2));
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-create-project-state

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-rollback
  // DEFECT FIX (PR review, reproduced against the built binary): every
  // refusal below this line used to leave `.frontx/project.json` behind —
  // the CLI reported failure, but the directory was left permanently
  // "already seeded" for every later `seed` attempt. Most of the failures
  // this rollback is reached from leave no payload FILE behind either
  // (`CONTENT_CONFLICT`/`EXISTING_PATHS_REQUIRE_DECISION`/`TARGET_CONFLICT`/
  // the pre-materialize payload-escape `INVALID_PATH` check all refuse
  // BEFORE `apply.ts`'s own materialize step — see that file's own
  // instruction ordering) — but a refusal reached AFTER materialization
  // (the AI-bundle step, or the project-state record step, or an
  // unexpected thrown write failure) does leave real payload files on disk,
  // and `apply.ts` now reports exactly which ones via `writtenPaths`
  // (`ApplyBatchOutcome`'s own `details.writtenPaths`). This rollback
  // removes those too — passed in by the caller below — in addition to its
  // own two writes: the project state document, and — only when `seed`
  // created it and it is now empty again — the `.frontx` directory that
  // document's write brought into being as a side effect.
  async function rollbackSeedWrites(writtenPaths: readonly string[] = []): Promise<void> {
    for (const relativePath of writtenPaths) {
      await deps.removeProjectFileFn(path.join(dir, relativePath));
    }
    await deps.removeProjectFileFn(projectStatePath(dir));
    if (!frontxDirPreexisted) {
      await deps.removeEmptyDirFn(frontxDir);
    }
  }

  // The `writtenPaths` an apply-phase failure's `details` carries, narrowed
  // from `unknown` — defensive against a caller-shaped `details` that
  // doesn't carry the field at all (every refusal BEFORE materialization)
  // or carries something other than a string array (never true for
  // `apply.ts`'s own outcome shape, but this reads a structurally untyped
  // `Record<string, unknown>`, not a value this function controls).
  function extractWrittenPaths(details: Record<string, unknown> | undefined): string[] {
    const value = details?.writtenPaths;
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-rollback

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-foreach-default
  const registeredDefaults: string[] = [];
  for (const name of Object.keys(batch.templates)) {
    const origin = officialDefaultOrigin(name);
    if (origin === undefined) {
      // Unreachable in practice — the pre-flight loop above
      // (`inst-seed-preflight-defaults`) already refused any name that does
      // not resolve to an official default. Guarded rather than assumed
      // away, for the same reason `apply.ts`'s own defensive branches are:
      // a future caller reaching this point some other way must still be
      // rolled back honestly rather than leaving the state document this
      // call already wrote behind.
      await rollbackSeedWrites();
      return {
        ok: false,
        code: 'TEMPLATE_NOT_REGISTERED',
        message:
          `Seed aborted — "${name}" is not one of the CLI's official default templates. Register it yourself ` +
          '(this creates ".frontx/project.json" on its own first mutation if it does not exist yet, exactly as ' +
          'seed itself would have) and then "apply" it; whole batch aborted, nothing remains written.',
        details: { name },
      };
    }

    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-register-default
    const registerResult = await registerTemplate(
      origin,
      false,
      dir,
      deps.inventory,
      deps.fetchFn,
      deps.readFileFn,
      deps.canonicalizeFn,
      deps.readProjectStateFn,
      deps.writeProjectStateFn,
      deps.existsFn,
      deps.listFolderFilesFn,
    );
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-register-default

    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-register-fail
    if (!registerResult.ok) {
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-rollback
      await rollbackSeedWrites();
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-rollback
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-register-fail
      return {
        ok: false,
        code: 'ORIGIN_UNAVAILABLE',
        message:
          `Seed aborted — official default "${name}" (origin "${origin}") could not be registered: ` +
          `${registerResult.message}; nothing remains written.`,
        details: { name, origin },
      };
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-register-fail
    }
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-register-fail
    registeredDefaults.push(name);
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-foreach-default

  // `inst-seed-resolve` through `inst-seed-return-done` are realized by the
  // IDENTICAL apply mechanism `apply`'s own dispatch calls
  // (`./apply.ts`'s `runApplyPipeline`, which itself calls the shared
  // `resolveAndCheckBatch`) — not re-marked or reformulated a second time
  // here.
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-resolve
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-resolve-fail
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-resolve-fail
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-conflict-check
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-conflict
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-conflict
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-existing-content
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-existing-conflict
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-existing-conflict
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-materialize
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-materialize-bundle
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-record
  // DEFECT FIX (PR review, reproduced against the built binary): this call
  // used to sit outside any `try` — a thrown failure (EACCES, ENOSPC, a
  // native abort) bypassed `inst-seed-rollback` entirely, propagating past
  // `seedRepository` and out through the CLI's own top-level catch-all
  // (`cli.ts`'s `run`) as exit 2 with empty `--json` stdout, and leaving the
  // directory locked out of every later `seed` call by the very document
  // this rollback exists to remove. `apply.ts` itself now converts every
  // write-phase throw it knows about into a structured refusal, but this
  // catch is the backstop for anything that still escapes — from apply's
  // own resolve/conflict-check phase or elsewhere — so rollback runs on
  // every path out of this call, not only a returned refusal.
  let applyResult: ApplyBatchOutcome;
  try {
    applyResult = await runApplyPipeline(batch, dir, adoptExisting, deps);
  } catch (error) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-rollback
    await rollbackSeedWrites();
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-rollback
    return {
      ok: false,
      code: 'INTERNAL',
      message:
        `Seed aborted — an unexpected error interrupted the apply phase: ` +
        `${error instanceof Error ? error.message : String(error)}; the project state document (and any ` +
        'directory it created) has been rolled back — nothing from this batch remains.',
    };
  }
  if (!applyResult.ok) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-rollback
    const writtenPaths = extractWrittenPaths(applyResult.details);
    await rollbackSeedWrites(writtenPaths);
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-rollback
    if (writtenPaths.length === 0) return applyResult;
    // `applyResult.message` itself names files as currently "on disk" —
    // true when `apply` returned it, false now that the rollback just
    // above removed exactly those paths. The CURRENT truth leads this
    // message; `applyResult.message` follows only as labeled, superseded
    // context — never restated as though it still describes the present,
    // which is exactly the stale, dishonest report `inst-seed-rollback`
    // exists to prevent. `details.writtenPaths` is dropped entirely for
    // the same reason: nothing it names is still true.
    const { writtenPaths: _rolledBack, ...remainingDetails } = applyResult.details ?? {};
    return {
      ok: false,
      code: applyResult.code,
      message:
        'Seed has rolled back everything this attempt wrote — nothing from this batch remains on disk. ' +
        `The apply phase's own refusal, before that rollback: ${applyResult.message}`,
      details: Object.keys(remainingDetails).length > 0 ? remainingDetails : undefined,
    };
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-record
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-materialize-bundle
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-materialize
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-existing-conflict
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-existing-conflict
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-existing-content
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-conflict
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-conflict
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-conflict-check
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-resolve-fail
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-resolve-fail
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-resolve

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-done
  return { ok: true, registeredDefaults, applied: applyResult.applied, noop: applyResult.noop };
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-done
}
