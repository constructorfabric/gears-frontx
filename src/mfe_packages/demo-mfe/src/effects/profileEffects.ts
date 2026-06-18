/**
 * Profile Domain - Effects
 *
 * Effects subscribe to events from the profile actions and dispatch to slices.
 * Following flux architecture: Actions emit events → Effects listen → dispatch to store.
 */

import { eventBus, apiRegistry, type AppDispatch } from '@gears-frontx/react';
import { AccountsApiService } from '../api/AccountsApiService';
import { setUser, setLoading, setError } from '../slices/profileSlice';
import '../events/profileEvents';

/**
 * Initialize profile domain effects.
 * Call once during MFE bootstrap (via registerSlice).
 *
 * @param dispatch - The store dispatch function
 */
export function initProfileEffects(dispatch: AppDispatch): void {
  eventBus.on('mfe/profile/user-fetch-requested', async () => {
    dispatch(setLoading(true));

    try {
      const response = await apiRegistry.getService(AccountsApiService).getCurrentUser();
      dispatch(setUser(response.user));
      dispatch(setLoading(false));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      dispatch(setError(message));
      dispatch(setLoading(false));
    }
  });
}
