import React from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { ThemeAwareReactLifecycle } from './shared/ThemeAwareReactLifecycle';
import { ProfileScreen } from './screens/profile/ProfileScreen';

class ProfileLifecycle extends ThemeAwareReactLifecycle {
  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <ProfileScreen bridge={bridge} />;
  }
}

/**
 * Export a singleton instance of the lifecycle class.
 * Module Federation expects a default export; the handler calls
 * moduleFactory() which returns this module, then validates it
 * has mount/unmount methods.
 */
export default new ProfileLifecycle();
