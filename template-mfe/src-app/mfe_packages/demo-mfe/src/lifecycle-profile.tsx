import React from 'react';
import type { ChildMfeBridge, JsonObject } from '@gears-frontx/react';
import { ActionHandler, ThemeAwareReactLifecycle } from '@gears-frontx/react';
import { mfeApp } from './init';
import { ProfileScreen } from './screens/profile/ProfileScreen';
import { fetchUser } from './actions/profileActions';
import { DEMO_ACTION_REFRESH_PROFILE } from './shared/extension-ids';

// @cpt-FEATURE:child-bridge-action-handler:p3

// @cpt-begin:child-bridge-action-handler:p3:inst-1
class ProfileRefreshHandler extends ActionHandler {
  handleAction(
    _actionTypeId: string,
    _payload: JsonObject | undefined
  ): Promise<void> {
    fetchUser();
    return Promise.resolve();
  }
}
// @cpt-end:child-bridge-action-handler:p3:inst-1

class ProfileLifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    super(mfeApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <ProfileScreen bridge={bridge} />;
  }

  // @cpt-begin:child-bridge-action-handler:p3:inst-2
  override mount(container: Element | ShadowRoot, bridge: ChildMfeBridge): void {
    // Let the base class render the React tree first so the screen is visible
    // before any action can arrive.
    super.mount(container, bridge);
    // Register after rendering so that any synchronous action dispatched in the
    // chained next step finds the handler already in place.
    bridge.registerActionHandler(DEMO_ACTION_REFRESH_PROFILE, new ProfileRefreshHandler());
  }
  // @cpt-end:child-bridge-action-handler:p3:inst-2
}

/**
 * Export a singleton instance of the lifecycle class.
 * Module Federation expects a default export; the handler calls
 * moduleFactory() which returns this module, then validates it
 * has mount/unmount methods.
 */
export default new ProfileLifecycle();
