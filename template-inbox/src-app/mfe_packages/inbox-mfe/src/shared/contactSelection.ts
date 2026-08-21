/**
 * The contact a jump from a thread is aiming at, held between the action that
 * carries it and the screen that opens it.
 *
 * Both orders happen and both must work. The chained `open_contact` action is
 * dispatched after the contacts extension has mounted, so its handler may run
 * before the React tree's first render (the value is waiting when the screen
 * reads it) or after it (the screen is already showing the table and has to be
 * told). One slot plus one subscriber covers both: the setter notifies, the
 * reader consumes.
 *
 * This is module state inside one loaded extension, not a channel between
 * extensions - the contacts lifecycle writes it and the contacts screen reads
 * it, and they are the same module graph by construction.
 */

type Listener = (contactId: string) => void;

let pendingContactId: string | null = null;
const listeners = new Set<Listener>();

/** Hands the target to a mounted screen if one is listening, and parks it for
 * the next one to take if none is. */
export const setPendingContact = (contactId: string): void => {
  if (listeners.size > 0) {
    for (const listener of listeners) listener(contactId);
    return;
  }
  pendingContactId = contactId;
};

/** Reads the pending contact and clears it, so a later plain visit to the
 * section opens on the table. */
export const takePendingContact = (): string | null => {
  const contactId = pendingContactId;
  pendingContactId = null;
  return contactId;
};

export const subscribePendingContact = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
