// @cpt-flow:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-project-scaffold:p1
import type { InventoryEntry } from '../inventory/types.js';
import { readManifestFromContent } from '../manifest/validate-contract.js';
import type { ConflictCheckFn, ScaffoldResult, WriteFileFn } from './types.js';

// @cpt-flow:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1
export async function scaffoldProject(
  templateRef: string,
  targetDir: string,
  lookupFn: (name: string) => InventoryEntry | undefined,
  conflictCheckFn: ConflictCheckFn,
  writeFileFn: WriteFileFn,
): Promise<ScaffoldResult> {
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-invoke-project-cmd
  // entry: project-level namespace scaffold command invoked
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-invoke-project-cmd

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-dispatch-to-resolver
  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-receive-entry
  const entry = lookupFn(templateRef);
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-receive-entry
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-dispatch-to-resolver

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-resolver-locate
  // shared resolver locates installed template entry — same lookupFn path used by all namespaces
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-resolver-locate

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-check-template-resolved
  if (!entry) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-abort-not-found
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-scaffold-op:p1:inst-transition-req-aborted-unresolved
    return {
      ok: false,
      reason: 'unresolved',
      message: `Scaffold aborted — template "${templateRef}" not found in local inventory.`,
    };
    // @cpt-end:cpt-frontx-state-cli-scaffolding-scaffold-op:p1:inst-transition-req-aborted-unresolved
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-abort-not-found
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-check-template-resolved

  // Template resolved — REQUESTED → RESOLVED
  // @cpt-begin:cpt-frontx-state-cli-scaffolding-scaffold-op:p1:inst-transition-req-resolved
  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-read-manifest
  const manifestResult = readManifestFromContent(entry.content);
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-read-manifest
  // @cpt-end:cpt-frontx-state-cli-scaffolding-scaffold-op:p1:inst-transition-req-resolved

  if (!manifestResult.ok) {
    return { ok: false, reason: 'unresolved', message: `Cannot read manifest: ${manifestResult.message}` };
  }

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-validate-kind
  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-check-kind
  if (manifestResult.manifest.kind !== 'project-template') {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-abort-kind-mismatch
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-scaffold-op:p1:inst-transition-resolved-aborted
    return {
      ok: false,
      reason: 'kind-mismatch',
      message: `Scaffold aborted — template kind mismatch: expected "project-template", got "${manifestResult.manifest.kind}".`,
    };
    // @cpt-end:cpt-frontx-state-cli-scaffolding-scaffold-op:p1:inst-transition-resolved-aborted
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-abort-kind-mismatch
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-check-kind
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-validate-kind

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-check-target-conflict
  const hasConflict = await conflictCheckFn(targetDir);
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-check-target-conflict

  if (hasConflict) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-abort-conflict
    return {
      ok: false,
      reason: 'conflict',
      message: `Scaffold aborted — target directory "${targetDir}" contains conflicting content.`,
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-abort-conflict
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-apply-project-scaffold
  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-enumerate-items
  const files = manifestResult.manifest.files ?? [];
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-enumerate-items

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-foreach-item
  for (const file of files) {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-resolve-dest
    const destPath = `${targetDir}/${file.path}`;
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-resolve-dest

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-write-item
    await writeFileFn(destPath, file.content);
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-write-item
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-foreach-item
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-apply-project-scaffold

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-return-done
  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-return-complete
  // @cpt-begin:cpt-frontx-state-cli-scaffolding-scaffold-op:p1:inst-transition-resolved-scaffolded
  return { ok: true, message: `Scaffold complete — project written to "${targetDir}".` };
  // @cpt-end:cpt-frontx-state-cli-scaffolding-scaffold-op:p1:inst-transition-resolved-scaffolded
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1:inst-return-complete
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1:inst-return-done
}
