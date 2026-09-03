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
import { registerTemplate } from './register';
import { officialDefaultOrigin } from './official-defaults';
import { runApplyPipeline } from './apply';
import type { ApplyBatchTargetRef, ApplyPipelineDeps } from './apply';
import type { UniformApplyBatch } from '../scaffold/assembler';
import { projectStatePath } from '../project-state/io';
import type { ProjectStateDocument } from '../project-state/types';
import type { ErrorCode } from '../envelope';

export type SeedRepositoryDeps = ApplyPipelineDeps;

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

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-create-project-state
  await deps.writeProjectStateFn(projectStatePath(dir), JSON.stringify(initialProjectStateDocument(), null, 2));
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-create-project-state

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-foreach-default
  const registeredDefaults: string[] = [];
  for (const name of Object.keys(batch.templates)) {
    const origin = officialDefaultOrigin(name);
    if (origin === undefined) {
      // Not one of the CLI's official defaults — `seed` accepts only those,
      // since nothing else can be registered against yet (no prior `seed`
      // call is required for a non-default template: `register` then
      // `apply` is the complete bootstrap on its own).
      return {
        ok: false,
        code: 'TEMPLATE_NOT_REGISTERED',
        message:
          `Seed aborted — "${name}" is not one of the CLI's official default templates. Register it yourself ` +
          '(this creates ".frontx/project.json" on its own first mutation if it does not exist yet, exactly as ' +
          'seed itself would have) and then "apply" it; whole batch aborted, nothing written.',
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
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-register-fail
      return {
        ok: false,
        code: 'ORIGIN_UNAVAILABLE',
        message: `Seed aborted — official default "${name}" (origin "${origin}") could not be registered: ${registerResult.message}`,
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
  const applyResult = await runApplyPipeline(batch, dir, adoptExisting, deps);
  if (!applyResult.ok) return applyResult;
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
