/**
 * How the mail list narrows what it shows, and how every count in the
 * sidebar and the list header is computed.
 *
 * Kept out of the components for the same reason `conversationOrdering.ts`
 * is: it is the one part of the screen with rules rather than markup, and
 * every count here is derived from `mails` rather than stored on a mailbox
 * row, so a search or a tab switch never has to keep two numbers in step by
 * hand.
 */

import type { Mail, MailboxId } from '../../api/mailTypes';

export const MAIL_TABS = ['all', 'unread'] as const;

export type MailTab = (typeof MAIL_TABS)[number];

export const isMailTab = (value: unknown): value is MailTab =>
  typeof value === 'string' && MAIL_TABS.some((tab) => tab === value);

/**
 * Live client-side filtering over the fields a mail reader scans: the
 * correspondent and the subject. The mock API answers with the whole
 * collection precisely so this can happen without a round trip.
 */
export function selectMails(
  mails: Mail[],
  mailboxId: MailboxId,
  tab: MailTab,
  search: string
): Mail[] {
  const needle = search.trim().toLowerCase();
  return mails
    .filter((mail) => mail.mailboxId === mailboxId)
    .filter((mail) => (tab === 'unread' ? !mail.read : true))
    .filter((mail) => {
      if (needle === '') return true;
      return (
        mail.correspondentName.toLowerCase().includes(needle) ||
        mail.subject.toLowerCase().includes(needle)
      );
    })
    .sort(
      (left, right) =>
        // Pinned before unpinned, ahead of the date sort - a pin overrides
        // recency the same way `conversationOrdering.ts`'s own comparators
        // do, so the list pane's pinned group and its auto-select-first
        // both land on the same ordering this returns.
        Number(right.pinned) - Number(left.pinned) ||
        Date.parse(right.receivedAt) - Date.parse(left.receivedAt)
    );
}

export const countInMailbox = (mails: Mail[], mailboxId: MailboxId): number =>
  mails.filter((mail) => mail.mailboxId === mailboxId).length;

export const countUnreadInMailbox = (mails: Mail[], mailboxId: MailboxId): number =>
  mails.filter((mail) => mail.mailboxId === mailboxId && !mail.read).length;
