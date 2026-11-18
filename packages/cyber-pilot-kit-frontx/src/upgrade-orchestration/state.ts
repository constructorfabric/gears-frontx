// @cpt-state:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p2

// @cpt-begin:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1:inst-to-analyzed
// @cpt-begin:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1:inst-to-reviewed
// @cpt-begin:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1:inst-to-applied
// @cpt-begin:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1:inst-to-declined
export const OrchestrationLifecycleState = {
  PROVENANCE_READ: 'PROVENANCE_READ',
  ANALYZED: 'ANALYZED',
  REVIEWED: 'REVIEWED',
  FAILED: 'FAILED',
  APPLIED: 'APPLIED',
  DECLINED: 'DECLINED',
} as const;
// @cpt-end:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1:inst-to-declined
// @cpt-end:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1:inst-to-applied
// @cpt-end:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1:inst-to-reviewed
// @cpt-end:cpt-frontx-state-ai-upgrade-orchestration-lifecycle:p1:inst-to-analyzed

export type OrchestrationLifecycleStateValue =
  (typeof OrchestrationLifecycleState)[keyof typeof OrchestrationLifecycleState];
