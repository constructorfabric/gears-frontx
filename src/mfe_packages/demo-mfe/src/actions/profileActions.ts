/**
 * Profile Domain - Actions
 *
 * Actions emit events to trigger profile flux flows.
 * Following flux architecture: Actions emit events → Effects listen and dispatch.
 */

import { eventBus } from '@gears-frontx/react';
import '../events/profileEvents';

/**
 * Request a user data fetch.
 * Emits 'mfe/profile/user-fetch-requested' — the profile effect handles the API call.
 */
export function fetchUser(): void {
  eventBus.emit('mfe/profile/user-fetch-requested');
}
