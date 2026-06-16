import React from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { ThemeAwareReactLifecycle } from '@gears-frontx/react';
import { mfeApp } from './init';
import { HomeScreen } from './screens/home/HomeScreen';

class BlankMfeLifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    // ThemeAwareReactLifecycle consumes the host handoff and passes the
    // shared server-state runtime into HAI3Provider for this mounted root.
    super(mfeApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <HomeScreen bridge={bridge} />;
  }
}

/**
 * Export a singleton instance of the lifecycle class.
 * Module Federation expects a default export; the handler calls
 * moduleFactory() which returns this module, then validates it
 * has mount/unmount methods.
 */
export default new BlankMfeLifecycle();
