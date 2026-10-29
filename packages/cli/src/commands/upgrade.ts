// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-single-engine:p1
//
// `frontx upgrade` command/invocation surface. This is the F14 engine's
// external integration point: an ecosystem artifact (F17 AI orchestration)
// drives the change-set engine through this command surface — by invoking
// this function (or, at the process boundary, the `frontx upgrade` CLI
// binary that wraps it) — WITHOUT importing the engine's internal modules
// (`upgrade/compute.js`, `upgrade/apply.js`, `upgrade/rollback.js`,
// `upgrade/flow.js`) or taking a compile-time package dependency on
// `@gears-frontx/cli` beyond this command surface. Both direct CLI use and
// F17 orchestration drive this same single engine
// (cpt-frontx-dod-upgrade-changeset-single-engine) — there is no second
// diff/apply implementation.
import { upgradeChangeSetReviewApproval } from '../upgrade/flow';
import type { UpgradeFlowDeps } from '../upgrade/flow';
import type { ChangeSet } from '../upgrade/types';

export interface UpgradeCommandResult {
  ok: boolean;
  status: 'applied' | 'declined' | 'resolution-failed' | 'apply-failed';
  // The reviewable change set, serialized as JSON — present whenever the
  // engine successfully computed a change set (i.e. resolution did not fail).
  changeSetJson?: string;
  message?: string;
  // Present only on 'apply-failed' when restoring the pre-upgrade snapshot
  // failed for these files, so the repository may be left partially upgraded.
  unrestoredPaths?: readonly string[];
}

// @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-invoke-upgrade
/**
 * `frontx upgrade` command surface — invokable by external artifacts without
 * importing the engine's internal modules. Emits the computed change set as
 * JSON and drives the single authoritative engine
 * (`upgradeChangeSetReviewApproval`) to completion.
 */
export async function upgradeCommand(
  projectRoot: string,
  targetVersion: string,
  deps: UpgradeFlowDeps,
): Promise<UpgradeCommandResult> {
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-invoke-upgrade
  let capturedChangeSet: ChangeSet | undefined;

  const wrappedDeps: UpgradeFlowDeps = {
    ...deps,
    presentAndGetApproval: async (changeSet) => {
      capturedChangeSet = changeSet;
      return deps.presentAndGetApproval(changeSet);
    },
  };

  const result = await upgradeChangeSetReviewApproval(projectRoot, targetVersion, wrappedDeps);
  const changeSetJson = capturedChangeSet ? JSON.stringify(capturedChangeSet) : undefined;

  switch (result.status) {
    case 'applied':
      return { ok: true, status: 'applied', changeSetJson };
    case 'declined':
      return { ok: true, status: 'declined', changeSetJson };
    case 'resolution-failed':
      return { ok: false, status: 'resolution-failed', message: result.message };
    case 'apply-failed':
      return {
        ok: false,
        status: 'apply-failed',
        message: result.message,
        ...(result.unrestoredPaths ? { unrestoredPaths: result.unrestoredPaths } : {}),
        changeSetJson,
      };
  }
}
