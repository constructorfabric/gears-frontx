import type { ReactNode } from 'react';
import { ThemeAwareReactLifecycle, type ChildMfeBridge } from '@gears-frontx/react';
import { mfeApp } from './init';
import { InboxScreen } from './screens/inbox/InboxScreen';
import { appendWorkspaceStyles } from './shared/appendWorkspaceStyles';

class InboxLifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    // ThemeAwareReactLifecycle consumes the host handoff and passes the shared
    // server-state runtime into FrontXProvider for this mounted root.
    super(mfeApp);
  }

  protected override initializeStyles(container: Element | ShadowRoot): void {
    appendWorkspaceStyles(container);
  }

  protected renderContent(bridge: ChildMfeBridge): ReactNode {
    return <InboxScreen bridge={bridge} />;
  }
}

/**
 * Module Federation expects a default export; the handler calls
 * moduleFactory(), then validates that what comes back has mount/unmount.
 */
export default new InboxLifecycle();
