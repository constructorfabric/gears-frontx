/**
 * DefaultDomainLifecycleTrigger - Concrete per-domain lifecycle trigger
 *
 * Delegates to `DefaultLifecycleManager` for all trigger operations.
 * Constructed by the registry once per registered domain and exposed to the
 * domain implementation through `DomainContext.lifecycleTrigger`.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1

import { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { DefaultLifecycleManager } from './default-lifecycle-manager';

/**
 * @internal
 */
export class DefaultDomainLifecycleTrigger extends DomainLifecycleTrigger {
  // @cpt-begin:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1:inst-default-ctor
  constructor(
    private readonly domainId: string,
    private readonly lifecycleManager: DefaultLifecycleManager
  ) {
    super();
  }
  // @cpt-end:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1:inst-default-ctor

  // @cpt-begin:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1:inst-default-ext-stage
  triggerExtensionStage(extId: string, stageId: string): Promise<void> {
    return this.lifecycleManager.triggerLifecycleStage(extId, stageId);
  }
  // @cpt-end:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1:inst-default-ext-stage

  // @cpt-begin:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1:inst-default-stage
  triggerStage(stageId: string): Promise<void> {
    return this.lifecycleManager.triggerDomainLifecycleStage(this.domainId, stageId);
  }
  // @cpt-end:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1:inst-default-stage

  // @cpt-begin:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1:inst-default-own-stage
  triggerOwnStage(stageId: string): Promise<void> {
    return this.lifecycleManager.triggerDomainOwnLifecycleStage(this.domainId, stageId);
  }
  // @cpt-end:cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract:p1:inst-default-own-stage
}
