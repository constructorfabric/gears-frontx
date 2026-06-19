// @cpt-flow:cpt-hai3-flow-framework-composition-app-bootstrap:p1

/**
 * Bootstrap Actions
 *
 * Actions for app-level bootstrap operations.
 * Following flux architecture: Actions emit events, Effects listen and dispatch.
 */

import { eventBus } from '@gears-frontx/react';
import type { ApiUser } from '@/app/api';

/**
 * Fetch current user
 * Emits 'app/user/fetch' event
 */
// @cpt-begin:cpt-hai3-flow-framework-composition-app-bootstrap:p1:inst-1
export function fetchCurrentUser(): void {
  eventBus.emit('app/user/fetch');
}

/**
 * Notify that user data has been loaded
 * Called by screens after successfully fetching user data.
 * Emits 'app/user/loaded' event so header state updates.
 */
export function notifyUserLoaded(user: ApiUser): void {
  eventBus.emit('app/user/loaded', { user });
}
// @cpt-end:cpt-hai3-flow-framework-composition-app-bootstrap:p1:inst-1
