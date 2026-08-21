/**
 * Jumping from a thread into that customer's contact detail.
 *
 * Two steps of one chain: mount the contacts extension, then - only once that
 * mount has resolved - tell it which contact to open. The mediator walks to
 * `next` after the primary step's promise settles, and mounting is what wires
 * and awaits the child lifecycle, so the contacts handler is registered before
 * the second step can dispatch. The ordering is a happens-before, not a timing
 * window.
 *
 * The target travels in the action's payload rather than in module state
 * because the two screens are separate loads with separate module graphs; the
 * chain is the channel that crosses that boundary. The screen domain mounts
 * exclusively, so mounting contacts is what unmounts the inbox.
 */

import {
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type ChildMfeBridge,
} from '@gears-frontx/react';
import { INBOX_OPEN_CONTACT } from './hostChromeActions';

export const CONTACTS_EXTENSION_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox.screens.contacts.v1';

/**
 * Mounting the contacts extension unmounts the React tree that is running this
 * click handler, so the call is deferred by one microtask: React finishes the
 * current event before the root it is rendering into is torn down. Calling
 * synchronously tears down the tree mid-handler.
 */
export const openContactDetail = (bridge: ChildMfeBridge, contactId: string): void => {
  queueMicrotask(() => {
    void bridge.executeActionsChain({
      action: {
        type: FRONTX_ACTION_MOUNT_EXT,
        target: FRONTX_SCREEN_DOMAIN,
        payload: { subject: CONTACTS_EXTENSION_ID },
      },
      next: {
        action: {
          type: INBOX_OPEN_CONTACT,
          target: CONTACTS_EXTENSION_ID,
          payload: { contactId },
        },
      },
    });
  });
};
