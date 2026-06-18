import React from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { ThemeAwareReactLifecycle } from './shared/ThemeAwareReactLifecycle';
import { HelloWorldScreen } from './screens/helloworld/HelloWorldScreen';

class HelloWorldLifecycle extends ThemeAwareReactLifecycle {
  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <HelloWorldScreen bridge={bridge} />;
  }
}

/**
 * Export a singleton instance of the lifecycle class.
 * Module Federation expects a default export; the handler calls
 * moduleFactory() which returns this module, then validates it
 * has mount/unmount methods.
 */
export default new HelloWorldLifecycle();
