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

import { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { DefaultLifecycleManager } from './default-lifecycle-manager';

/**
 * @internal
 */
export class DefaultDomainLifecycleTrigger extends DomainLifecycleTrigger {
  constructor(
    private readonly domainId: string,
    private readonly lifecycleManager: DefaultLifecycleManager
  ) {
    super();
  }

  triggerExtensionStage(extId: string, stageId: string): Promise<void> {
    return this.lifecycleManager.triggerLifecycleStage(extId, stageId);
  }

  triggerStage(stageId: string): Promise<void> {
    return this.lifecycleManager.triggerDomainLifecycleStage(this.domainId, stageId);
  }

  triggerOwnStage(stageId: string): Promise<void> {
    return this.lifecycleManager.triggerDomainOwnLifecycleStage(this.domainId, stageId);
  }
}
