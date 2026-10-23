// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-state:cpt-frontx-state-upgrade-changeset-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-computation:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-apply:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-rollback:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-single-engine:p1
import { computeChangeSet } from './compute';
import { applyChangeSet } from './apply';
import { ChangeSetLifecycleState } from './state';
import type {
  ProjectSnapshot,
  ReadProvenanceFn,
  FetchFn,
  ReadProjectFileFn,
  WriteProjectFileFn,
  RemoveProjectFileFn,
  WriteProvenanceFn,
  PresentAndGetApprovalFn,
} from './types';
import type { ReadContentItemsFn } from '../scaffold/types';

export type UpgradeFlowResult =
  | { status: 'applied'; targetVersion: string; snapshot: ProjectSnapshot; lifecycleHistory: readonly ChangeSetLifecycleState[] }
  | { status: 'declined'; lifecycleHistory: readonly ChangeSetLifecycleState[] }
  | { status: 'resolution-failed'; message: string }
  // `unrestoredPaths`: see `ApplyResult` — the files a failed apply could not
  // restore, present only when the repository may be left partially upgraded.
  | {
      status: 'apply-failed';
      message: string;
      unrestoredPaths?: readonly string[];
      lifecycleHistory: readonly ChangeSetLifecycleState[];
    };

// All dependencies are injected — CLI and F17 AI orchestration use the same engine.
// CLI-1 (cpt-frontx-constraint-cli-template-independence): no hardcoded template names;
// templateIdentity and versions are resolved at runtime from provenance and local inventory.
export interface UpgradeFlowDeps {
  readProvenance: ReadProvenanceFn;
  // Shared resolver's fetch primitive — the ONLY path to baseline/target
  // content; the engine re-resolves via provenance's source-spec at each
  // requested version, never from the single-entry local inventory.
  fetchFn: FetchFn;
  readProjectFile: ReadProjectFileFn;
  readContentItems: ReadContentItemsFn;
  writeProjectFile: WriteProjectFileFn;
  removeProjectFile: RemoveProjectFileFn;
  writeProvenance: WriteProvenanceFn;
  presentAndGetApproval: PresentAndGetApprovalFn;
}

// @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-invoke-upgrade
/**
 * Single authoritative change-set engine entry point.
 * Both direct CLI invocation and F17 AI-driven orchestration drive this same function —
 * no second diff/apply implementation exists (cpt-frontx-dod-upgrade-changeset-single-engine).
 */
export async function upgradeChangeSetReviewApproval(
  projectRoot: string,
  targetVersion: string,
  deps: UpgradeFlowDeps,
): Promise<UpgradeFlowResult> {
// @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-invoke-upgrade

  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-read-provenance
  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-compute-diff
  const computeResult = await computeChangeSet(projectRoot, targetVersion, {
    readProvenance: deps.readProvenance,
    fetchFn: deps.fetchFn,
    readProjectFile: deps.readProjectFile,
    readContentItems: deps.readContentItems,
  });
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-compute-diff
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-read-provenance

  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-if-no-target
  if (!computeResult.ok) {
    // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-abort-no-target
    return { status: 'resolution-failed', message: computeResult.message };
    // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-abort-no-target
  }
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-if-no-target

  // State: COMPUTED — change set has been built
  // @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-computed-to-presented
  const lifecycleHistory: ChangeSetLifecycleState[] = [ChangeSetLifecycleState.COMPUTED];
  // @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-computed-to-presented

  const { changeSet, provenance } = computeResult;

  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-present-changeset
  const approval = await deps.presentAndGetApproval(changeSet);
  lifecycleHistory.push(ChangeSetLifecycleState.PRESENTED);
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-present-changeset

  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-if-approved
  if (approval === 'approved') {
    // @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-presented-to-approved
    lifecycleHistory.push(ChangeSetLifecycleState.APPROVED);
    // @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-presented-to-approved

    // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-apply-changeset
    const applyResult = await applyChangeSet(changeSet, projectRoot, provenance, {
      readProjectFile: deps.readProjectFile,
      writeProjectFile: deps.writeProjectFile,
      removeProjectFile: deps.removeProjectFile,
      writeProvenance: deps.writeProvenance,
    });
    // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-apply-changeset

    if (!applyResult.ok) {
      return {
        status: 'apply-failed',
        message: applyResult.message,
        ...(applyResult.unrestoredPaths ? { unrestoredPaths: applyResult.unrestoredPaths } : {}),
        lifecycleHistory,
      };
    }

    // @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-approved-to-applied
    lifecycleHistory.push(ChangeSetLifecycleState.APPLIED);
    // @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-approved-to-applied

    // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-update-provenance
    // Provenance update is performed inside applyChangeSet — inst-app-update-prov
    // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-update-provenance

    // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-return-success
    return { status: 'applied', targetVersion, snapshot: applyResult.snapshot, lifecycleHistory };
    // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-return-success
  }
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-if-approved

  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-else-declined
  // @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-presented-to-rejected
  lifecycleHistory.push(ChangeSetLifecycleState.REJECTED);
  // @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-presented-to-rejected

  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-no-write-on-decline
  // No project files written on decline — return immediately
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-no-write-on-decline

  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-return-declined
  return { status: 'declined', lifecycleHistory };
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-return-declined
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-else-declined
}
