/**
 * Jumping from a thread into that customer's contact detail.
 *
 * The two screens are two extensions of one package, so they share a module
 * graph: handing the target over is a module-level slot plus a mount action,
 * and needs no host infrastructure. The screen domain mounts exclusively, so
 * mounting the contacts extension is what unmounts the inbox one.
 */

import {
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type ChildMfeBridge,
} from '@gears-frontx/react';

export const CONTACTS_EXTENSION_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox.screens.contacts.v1';

/** Consumed by whichever contacts screen mounts next, then cleared. */
let pendingContactId: string | null = null;

export const takePendingContactId = (): string | null => {
  const contactId = pendingContactId;
  pendingContactId = null;
  return contactId;
};

/**
 * Mounting the contacts extension unmounts the React tree that is running this
 * click handler, so the call is deferred by one microtask: React finishes the
 * current event before the root it is rendering into is torn down. Calling
 * synchronously tears down the tree mid-handler.
 */
export const openContactDetail = (bridge: ChildMfeBridge, contactId: string): void => {
  pendingContactId = contactId;
  queueMicrotask(() => {
    void bridge.executeActionsChain({
      action: {
        type: FRONTX_ACTION_MOUNT_EXT,
        target: FRONTX_SCREEN_DOMAIN,
        payload: { subject: CONTACTS_EXTENSION_ID },
      },
    });
  });
};
