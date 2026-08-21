import type { ReactNode } from 'react';
import {
  ActionHandler,
  ThemeAwareReactLifecycle,
  type ChildMfeBridge,
  type JsonObject,
} from '@gears-frontx/react';
import { mfeApp } from './init';
import { ContactsScreen } from './screens/contacts/ContactsScreen';
import { appendWorkspaceStyles } from './shared/appendWorkspaceStyles';
import { setPendingContact } from './shared/contactSelection';
import { INBOX_OPEN_CONTACT } from './shared/hostChromeActions';

/** Answers the second step of the jump from a thread: which contact to open. */
class OpenContactHandler extends ActionHandler {
  handleAction(_actionTypeId: string, payload: JsonObject | undefined): Promise<void> {
    const contactId = payload?.contactId;
    if (typeof contactId === 'string') setPendingContact(contactId);
    return Promise.resolve();
  }
}

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

  override mount(container: Element | ShadowRoot, bridge: ChildMfeBridge): void {
    // Render first, register after: the chained action is dispatched the
    // moment this mount resolves, and the handler has to be in place by then.
    super.mount(container, bridge);
    bridge.registerActionHandler(INBOX_OPEN_CONTACT, new OpenContactHandler());
  }
}

export default new ContactsLifecycle();
