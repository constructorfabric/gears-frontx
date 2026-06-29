// @cpt-flow:cpt-frontx-flow-framework-composition-app-bootstrap:p1

/**
 * Bootstrap Effects
 *
 * Effects for app-level bootstrap operations.
 * Following flux architecture: Listen to events from actions, dispatch to slices.
 */

import trim from 'lodash/trim';
import { eventBus, setUser, setHeaderLoading, apiRegistry, type AppDispatch, type HeaderUser } from '@gears-frontx/react';
import { AccountsApiService, type ApiUser } from '@/app/api';

/**
 * Convert API user to header user info
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-1
function toHeaderUser(user: ApiUser): HeaderUser {
  const displayName = trim(`${user.firstName || ''} ${user.lastName || ''}`);
  return {
    displayName: displayName || undefined,
    email: user.email || undefined,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Register bootstrap effects
 * Called once during app initialization
 */
export function registerBootstrapEffects(appDispatch: AppDispatch): void {
  // Store dispatch for use in event listeners
  const dispatch = appDispatch;

  // Listen for 'app/user/fetch' event
  eventBus.on('app/user/fetch', async () => {
    let headerLoadingStarted = false;
    try {
      // Check if accounts service is registered before trying to use it
      if (!apiRegistry.has(AccountsApiService)) {
        // Accounts service not registered - skip user fetch
        return;
      }

      dispatch(setHeaderLoading(true));
      headerLoadingStarted = true;

      // Get accounts service using class-based registration
      const accountsService = apiRegistry.getService(AccountsApiService);
      const response = await accountsService.getCurrentUser.fetch();
      if (response?.user) {
        dispatch(setUser(toHeaderUser(response.user)));
      }
    } catch (error) {
      console.warn('Failed to fetch user:', error);
    } finally {
      if (headerLoadingStarted) {
        dispatch(setHeaderLoading(false));
      }
    }
  });

  // Listen for 'app/user/loaded' event - updates header when any screen loads user data
  eventBus.on('app/user/loaded', ({ user }) => {
    dispatch(setUser(toHeaderUser(user)));
  });
}
// @cpt-end:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-1
