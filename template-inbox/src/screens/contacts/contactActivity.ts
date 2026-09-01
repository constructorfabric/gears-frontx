/**
 * The contact detail's Recent activity timeline.
 *
 * Derived from the contact's own record rather than stored as a second list:
 * every entry the reference shows - a ticket opened, a conversation started,
 * the sign-up, the day the contact was added - is already a dated fact on the
 * contact, and a stored timeline would be the same facts written twice.
 */

import type { Contact } from '../../api/types';

export type ActivityKind = 'ticket' | 'conversation' | 'signed-up' | 'added';

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  label: string;
  at: string;
};

export function buildActivity(contact: Contact): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    ...contact.tickets.map((ticket) => ({
      id: `ticket-${ticket.id}`,
      kind: 'ticket' as const,
      label: `Opened ticket ${ticket.number}`,
      at: ticket.openedAt,
    })),
    ...contact.conversations.map((conversation) => ({
      id: `conversation-${conversation.id}`,
      kind: 'conversation' as const,
      label: 'Started a conversation',
      at: conversation.at,
    })),
    { id: 'added', kind: 'added', label: 'Added as contact', at: contact.addedAt },
  ];

  // A lead never signed up, and the timeline should not claim otherwise.
  if (contact.signedUpAt !== '') {
    entries.push({ id: 'signed-up', kind: 'signed-up', label: 'Signed up', at: contact.signedUpAt });
  }

  return entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}
