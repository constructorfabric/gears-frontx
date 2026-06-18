// @cpt-flow:cpt-hai3-flow-framework-composition-app-config:p1

/**
 * Tenant Actions
 *
 * Action functions for setting and clearing tenant.
 * These emit events that are consumed by tenantEffects.
 */

import { eventBus, getStore } from '@gears-frontx/state';
import { setTenantLoading } from '../slices/tenantSlice';
import { TenantEvents } from './tenantEffects';
import type { Tenant } from '../layoutTypes';

/**
 * Set tenant via event bus
 * This is the recommended way for consuming apps to set tenant.
 *
 * @example
 * ```typescript
 * import { changeTenant } from '@gears-frontx/framework';
 * changeTenant({ id: 'tenant-123' });
 * ```
 */
// @cpt-begin:cpt-hai3-flow-framework-composition-app-config:p1:inst-1
export function changeTenant(tenant: Tenant): void {
  eventBus.emit(TenantEvents.Changed, { tenant });
}

/**
 * Clear tenant via event bus
 */
export function clearTenantAction(): void {
  eventBus.emit(TenantEvents.Cleared, {});
}

/**
 * Set tenant loading state (direct dispatch, for internal use)
 */
export function setTenantLoadingState(loading: boolean): void {
  getStore().dispatch(setTenantLoading(loading));
}
// @cpt-end:cpt-hai3-flow-framework-composition-app-config:p1:inst-1
