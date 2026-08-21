import type { ReactNode } from 'react';
import { ThemeAwareReactLifecycle, type ChildMfeBridge } from '@gears-frontx/react';
import { mfeApp } from './init';
import { ContactsScreen } from './screens/contacts/ContactsScreen';
import { appendWorkspaceStyles } from './shared/appendWorkspaceStyles';

class ContactsLifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    super(mfeApp);
  }

  protected override initializeStyles(container: Element | ShadowRoot): void {
    appendWorkspaceStyles(container);
  }

  protected renderContent(bridge: ChildMfeBridge): ReactNode {
    return <ContactsScreen bridge={bridge} />;
  }
}

export default new ContactsLifecycle();
