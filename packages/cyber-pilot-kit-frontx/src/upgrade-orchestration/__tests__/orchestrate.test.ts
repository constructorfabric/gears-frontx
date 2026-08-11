// @cpt-flow:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1
// @cpt-state:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
//
// PLAN CORRECTION (2026-07-14) — REOPENED: no import from the CLI package,
// no linking of `computeChangeSet`/`applyChangeSet`. `invokeUpgradeCommand` is
// a test double for the `frontx upgrade` COMMAND/INVOCATION SURFACE: it
// receives a callback that this orchestration layer uses to enrich the raw
// change set and return a review decision, mirroring exactly how a real
// process-boundary adapter (spawning the `frontx` CLI, parsing its JSON
// output) would be wired without ever importing the CLI package.
//
// PHASE 8 — multi-record provenance SET: `readProvenance` now returns the
// project's FULL provenance record set (one record per applied template,
// `cpt-frontx-contract-project-provenance`); orchestration selects the
// NAMED applied template's record before invoking the command surface.
import { describe, it, expect, vi } from 'vitest';
import { orchestrateAiDrivenUpgrade, type OrchestrationDeps } from '../orchestrate.js';
import type { ChangeSet, InvokeUpgradeCommandFn, ProvenanceRecord, ReviewDecision } from '../types.js';

const PROJ_ROOT = '/proj';

const PROVENANCE_RECORD: ProvenanceRecord = {
  templateIdentity: 'my-template',
  scaffoldedFromVersion: '1.0.0',
  sourceSpec: 'local:my-template',
};

// A second applied template's record — proves selection reaches into a
// multi-record SET rather than assuming a single whole-repository origin.
const OTHER_PROVENANCE_RECORD: ProvenanceRecord = {
  templateIdentity: 'other-template',
  scaffoldedFromVersion: '3.4.0',
  sourceSpec: 'local:other-template',
};

const PROVENANCE_SET: ProvenanceRecord[] = [PROVENANCE_RECORD, OTHER_PROVENANCE_RECORD];

const RESOLVABLE_CHANGESET: ChangeSet = {
  templateIdentity: 'my-template',
  baselineVersion: '1.0.0',
  targetVersion: '2.0.0',
  targetOccupiedOwnershipBoundary: '{"exclusiveSubtrees":["src/"],"sharedFiles":[]}',
  clean: [{ kind: 'modify', path: 'src/App.tsx', content: 'v2 content' }],
  conflicts: [],
};

// Test double for the `frontx upgrade` command/invocation surface. Mirrors
// the real command's contract: it computes (or fails to compute) a change
// set, hands it to `onChangeSet` for review, and applies only on 'approved'.
function makeCommandInvoker(options: {
  resolvable?: boolean;
  applyFails?: boolean;
  changeSet?: ChangeSet;
}): { invoke: InvokeUpgradeCommandFn; appliedSpy: ReturnType<typeof vi.fn> } {
  const appliedSpy = vi.fn();
  const invoke: InvokeUpgradeCommandFn = async (_projectRoot, _targetVersion, onChangeSet) => {
    if (options.resolvable === false) {
      return { ok: false, status: 'resolution-failed', message: 'Target template not found in local inventory.' };
    }
    const decision: ReviewDecision = await onChangeSet(options.changeSet ?? RESOLVABLE_CHANGESET);
    if (decision === 'approved') {
      if (options.applyFails) {
        return { ok: false, status: 'apply-failed', message: 'Could not write project files.' };
      }
      appliedSpy();
      return { ok: true, status: 'applied' };
    }
    return { ok: true, status: 'declined' };
  };
  return { invoke, appliedSpy };
}

function baseDeps(overrides: Partial<OrchestrationDeps> = {}): OrchestrationDeps {
  const { invoke } = makeCommandInvoker({});
  return {
    readProvenance: vi.fn().mockResolvedValue(PROVENANCE_SET),
    invokeUpgradeCommand: invoke,
    presentEnrichedReview: vi.fn().mockResolvedValue('declined'),
    ...overrides,
  };
}

describe('orchestrateAiDrivenUpgrade (F17 — drives the SINGLE F14 engine through its command surface, never a second one)', () => {
  // inst-request-upgrade / inst-read-provenance / inst-check-provenance / inst-provenance-missing
  it('returns provenance-missing and never invokes the command surface when the provenance set is absent', async () => {
    const { invoke } = makeCommandInvoker({});
    const invokeSpy = vi.fn(invoke);
    const deps = baseDeps({ readProvenance: vi.fn().mockResolvedValue(null), invokeUpgradeCommand: invokeSpy });
    const result = await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'my-template', '2.0.0', deps);
    expect(result.status).toBe('provenance-missing');
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  // inst-read-provenance / inst-check-provenance / inst-provenance-missing — multi-record set, no match
  it('returns provenance-missing when the provenance SET holds records but none for the named applied template', async () => {
    const { invoke } = makeCommandInvoker({});
    const invokeSpy = vi.fn(invoke);
    const deps = baseDeps({ readProvenance: vi.fn().mockResolvedValue(PROVENANCE_SET), invokeUpgradeCommand: invokeSpy });
    const result = await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'no-such-template', '2.0.0', deps);
    expect(result.status).toBe('provenance-missing');
    if (result.status === 'provenance-missing') {
      expect(result.message).toContain('no-such-template');
    }
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  // inst-read-provenance / inst-check-provenance — multi-record set, selects the NAMED record (not the first one)
  it('selects the record for the named applied template out of a multi-record provenance set', async () => {
    const readProvenance = vi.fn().mockResolvedValue(PROVENANCE_SET);
    const { invoke } = makeCommandInvoker({});
    const deps = baseDeps({
      readProvenance,
      invokeUpgradeCommand: invoke,
      presentEnrichedReview: vi.fn().mockResolvedValue('declined'),
    });
    // Named template is the SECOND record in the set.
    const result = await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'other-template', '4.0.0', deps);
    expect(readProvenance).toHaveBeenCalledWith(PROJ_ROOT);
    expect(result.status).toBe('declined');
    if (result.status === 'declined') {
      expect(result.reviewPackage.selectedTemplate).toEqual({
        templateIdentity: 'other-template',
        currentVersion: '3.4.0',
      });
    }
  });

  // inst-invoke-enrichment / inst-check-changeset / inst-empty-changeset
  it('returns empty-changeset and presents no review when the command surface cannot resolve the change set', async () => {
    const { invoke } = makeCommandInvoker({ resolvable: false });
    const presentSpy = vi.fn();
    const deps = baseDeps({ invokeUpgradeCommand: invoke, presentEnrichedReview: presentSpy });
    const result = await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'my-template', '9.9.9', deps);
    expect(result.status).toBe('empty-changeset');
    expect(presentSpy).not.toHaveBeenCalled();
  });

  // inst-invoke-enrichment / inst-check-changeset / inst-empty-changeset — resolved but empty change set
  it('returns empty-changeset when the resolved change set has no clean/conflict entries', async () => {
    const emptyChangeSet: ChangeSet = { ...RESOLVABLE_CHANGESET, clean: [], conflicts: [] };
    const { invoke } = makeCommandInvoker({ changeSet: emptyChangeSet });
    const presentSpy = vi.fn();
    const deps = baseDeps({ invokeUpgradeCommand: invoke, presentEnrichedReview: presentSpy });
    const result = await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'my-template', '1.0.0', deps);
    expect(result.status).toBe('empty-changeset');
    expect(presentSpy).not.toHaveBeenCalled();
  });

  // inst-extract-provenance / inst-present-review / inst-gate-approve / inst-engine-apply / inst-update-provenance / inst-return-applied
  it('approval triggers the command surface\'s engine apply exactly once, enrichment reflects the selected template', async () => {
    const { invoke, appliedSpy } = makeCommandInvoker({});
    const deps = baseDeps({
      invokeUpgradeCommand: invoke,
      presentEnrichedReview: vi.fn().mockResolvedValue('approved'),
    });
    const result = await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'my-template', '2.0.0', deps);
    expect(result.status).toBe('applied');
    expect(appliedSpy).toHaveBeenCalledTimes(1);
    if (result.status === 'applied') {
      expect(result.reviewPackage.impactAnalysis.entries.length).toBeGreaterThan(0);
      expect(result.reviewPackage.selectedTemplate).toEqual({
        templateIdentity: 'my-template',
        currentVersion: '1.0.0',
      });
    }
  });

  // inst-gate-approve / apply-failed path
  it('surfaces apply-failed from the command surface without treating it as applied', async () => {
    const { invoke, appliedSpy } = makeCommandInvoker({ applyFails: true });
    const deps = baseDeps({
      invokeUpgradeCommand: invoke,
      presentEnrichedReview: vi.fn().mockResolvedValue('approved'),
    });
    const result = await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'my-template', '2.0.0', deps);
    expect(result.status).toBe('apply-failed');
    expect(appliedSpy).not.toHaveBeenCalled();
  });

  // inst-gate-decline / inst-no-write / inst-return-declined — the review gate stands unconditionally
  it('decline never triggers the command surface\'s engine apply', async () => {
    const { invoke, appliedSpy } = makeCommandInvoker({});
    const deps = baseDeps({
      invokeUpgradeCommand: invoke,
      presentEnrichedReview: vi.fn().mockResolvedValue('declined'),
    });
    const result = await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'my-template', '2.0.0', deps);
    expect(result.status).toBe('declined');
    expect(appliedSpy).not.toHaveBeenCalled();
  });

  // Single-engine / command-surface invariant: driven exactly once, never a second implementation
  it('drives the injected command surface exactly once per upgrade (no reimplementation, no duplicate invocation)', async () => {
    const { invoke } = makeCommandInvoker({});
    const invokeSpy = vi.fn(invoke);
    const deps = baseDeps({
      invokeUpgradeCommand: invokeSpy,
      presentEnrichedReview: vi.fn().mockResolvedValue('approved'),
    });
    await orchestrateAiDrivenUpgrade(PROJ_ROOT, 'my-template', '2.0.0', deps);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });
});
