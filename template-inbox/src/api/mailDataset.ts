/**
 * Mail domain - the seeded content, and the only module that holds any.
 *
 * Same discipline as `dataset.ts`: imported by `mailMocks.ts` alone, instants
 * resolved once at module load as offsets from `ANCHOR_MS` so the list keeps
 * reading "1h" and "2d" on any run day, and every mailbox count downstream is
 * computed from `mails` rather than stored on a row - see `mailSelectors.ts`.
 *
 * 13 mails across the five mailboxes this product ships (no Spam - the owner
 * dropped it from the product): 6 Inbox, 2 Drafts, 2 Sent, 2 Archive, 1
 * Trash. Three are unread, all in Inbox - unread is an Inbox-only concept
 * here, the same way a sent or archived message is never "unread" in the
 * reference. Two carry history: `ml-2` and `ml-11`, each with two earlier
 * messages in `mailMessages` behind the reading pane's toggle.
 */

import type { Mail, MailMessage, Mailbox, MailboxId } from './mailTypes';

const ANCHOR_MS = Date.now();

const hoursAgo = (hours: number): string => new Date(ANCHOR_MS - hours * 3_600_000).toISOString();

const daysAgo = (days: number): string => hoursAgo(days * 24);

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Calendar text for a history card's date line, matching the transcript's
 * own format in `mocks.ts`. */
const calendarText = (iso: string): string =>
  `${dateFormat.format(new Date(iso))} - ${timeFormat.format(new Date(iso))}`;

export const MAILBOX_INBOX: MailboxId = 'inbox';
export const MAILBOX_DRAFTS: MailboxId = 'drafts';
export const MAILBOX_SENT: MailboxId = 'sent';
export const MAILBOX_ARCHIVE: MailboxId = 'archive';
export const MAILBOX_TRASH: MailboxId = 'trash';

/** Static navigation metadata, fetched the same way `channels` is - a real
 * backend would answer the label set even though every count downstream is
 * recomputed client-side from `mails`. */
export const mailboxes: Mailbox[] = [
  { id: MAILBOX_INBOX, label: 'Inbox' },
  { id: MAILBOX_DRAFTS, label: 'Drafts' },
  { id: MAILBOX_SENT, label: 'Sent' },
  { id: MAILBOX_ARCHIVE, label: 'Archive' },
  { id: MAILBOX_TRASH, label: 'Trash' },
];

export const mails: Mail[] = [
  // --- Inbox: 6, three unread (ml-1, ml-2, ml-4) ---
  {
    id: 'ml-1',
    mailboxId: MAILBOX_INBOX,
    correspondentName: 'Priya Natarajan',
    correspondentEmail: 'priya@northstar.io',
    subject: 'Q3 planning doc ready for review',
    snippet: 'Sharing the draft ahead of Thursday - flag anything that looks off before I circulate it wider.',
    body: 'Hi team,\n\nSharing the draft ahead of Thursday - flag anything that looks off before I circulate it wider. The headcount section is still rough, everything else should be close to final.\n\nPriya',
    receivedAt: hoursAgo(1),
    read: false,
    starred: true,
    pinned: false,
  },
  {
    id: 'ml-2',
    mailboxId: MAILBOX_INBOX,
    correspondentName: 'Devon Ashworth',
    correspondentEmail: 'devon@brightlabs.io',
    subject: 'Re: staging environment access',
    snippet: 'Access is granted - you should be able to log in now with the credentials from the earlier email.',
    body: 'Access is granted - you should be able to log in now with the credentials from the earlier email. Let me know if the reset link does not arrive.',
    receivedAt: hoursAgo(2),
    read: false,
    starred: false,
    pinned: false,
  },
  {
    id: 'ml-3',
    mailboxId: MAILBOX_INBOX,
    correspondentName: 'Ava Laurent',
    correspondentEmail: 'ava@atelier.fr',
    subject: 'Invoice #4471 attached',
    snippet: 'Please find the invoice for last month attached - let me know if the billing address needs updating.',
    body: 'Hello,\n\nPlease find the invoice for last month attached - let me know if the billing address needs updating.\n\nBest,\nAva',
    receivedAt: hoursAgo(5),
    read: true,
    starred: false,
    // Pinned ahead of Inbox's own most-recent rows (ml-1, ml-2) -
    // demonstrates a pin genuinely reordering the list.
    pinned: true,
  },
  {
    id: 'ml-4',
    mailboxId: MAILBOX_INBOX,
    correspondentName: 'Kenji Sato',
    correspondentEmail: 'kenji@harborworks.jp',
    subject: 'Team offsite - final headcount needed',
    snippet: 'Venue needs the final number by Friday - please confirm if you and your team are joining.',
    body: 'Hi,\n\nVenue needs the final number by Friday - please confirm if you and your team are joining. So far we are at 18 confirmed.\n\nKenji',
    receivedAt: hoursAgo(7),
    read: false,
    starred: false,
    pinned: false,
  },
  {
    id: 'ml-5',
    mailboxId: MAILBOX_INBOX,
    correspondentName: 'Freya Lindberg',
    correspondentEmail: 'newsletter@nordkit.se',
    subject: 'Weekly newsletter: product roundup',
    snippet: 'This week: three shipped features, one community spotlight, and a survey we would love your input on.',
    body: 'This week: three shipped features, one community spotlight, and a survey we would love your input on.\n\nRead the full roundup on the blog.',
    receivedAt: daysAgo(1),
    read: true,
    starred: true,
    pinned: false,
  },
  {
    id: 'ml-6',
    mailboxId: MAILBOX_INBOX,
    correspondentName: 'Carlos Mendez',
    correspondentEmail: 'billing@deltaops.example',
    subject: 'Domain renewal reminder',
    snippet: 'Your domain is set to renew in 14 days - no action is needed unless you want to change the plan.',
    body: 'Your domain is set to renew in 14 days - no action is needed unless you want to change the plan.',
    receivedAt: daysAgo(2),
    read: true,
    starred: false,
    // Pinned even though it is Inbox's own oldest row - a second reorder
    // example (jumps from last to the top of the pinned group).
    pinned: true,
  },

  // --- Drafts: 2, addressed to a correspondent, never unread ---
  {
    id: 'ml-7',
    mailboxId: MAILBOX_DRAFTS,
    correspondentName: 'Freya Lindberg',
    correspondentEmail: 'freya@nordkit.se',
    subject: 'Re: Weekly newsletter: product roundup',
    snippet: 'Thanks for the roundup - quick question about the survey link before I share it internally...',
    body: 'Thanks for the roundup - quick question about the survey link before I share it internally, does it expire?',
    receivedAt: hoursAgo(3),
    read: true,
    starred: false,
    pinned: false,
  },
  {
    id: 'ml-8',
    mailboxId: MAILBOX_DRAFTS,
    correspondentName: 'Tariq Haddad',
    correspondentEmail: 'tariq@scaleupworks.example',
    subject: 'Proposal follow-up',
    snippet: 'Circling back on the proposal from last week - happy to walk through the numbers whenever works.',
    body: 'Circling back on the proposal from last week - happy to walk through the numbers whenever works for you.',
    receivedAt: daysAgo(1),
    read: true,
    starred: false,
    pinned: false,
  },

  // --- Sent: 2 ---
  {
    id: 'ml-9',
    mailboxId: MAILBOX_SENT,
    correspondentName: 'Isla Fraser',
    correspondentEmail: 'isla@fjordly.no',
    subject: 'Re: Contract renewal terms',
    snippet: 'Confirmed - the renewal terms look good on our side, sending the signed copy over today.',
    body: 'Confirmed - the renewal terms look good on our side, sending the signed copy over today.',
    receivedAt: hoursAgo(6),
    read: true,
    starred: false,
    pinned: false,
  },
  {
    id: 'ml-10',
    mailboxId: MAILBOX_SENT,
    correspondentName: 'Yuki Tanaka',
    correspondentEmail: 'yuki@lumenworks.example',
    subject: 'Shipping update for order #2291',
    snippet: 'Your order has shipped and should arrive within 3-5 business days - tracking is attached.',
    body: 'Your order has shipped and should arrive within 3-5 business days - tracking is attached.',
    receivedAt: daysAgo(3),
    read: true,
    starred: false,
    // Pinned ahead of Sent's own most-recent row (ml-9) - a reorder
    // example for a non-Inbox mailbox too.
    pinned: true,
  },

  // --- Archive: 2, ml-11 carries history ---
  {
    id: 'ml-11',
    mailboxId: MAILBOX_ARCHIVE,
    correspondentName: 'Mateus Rocha',
    correspondentEmail: 'mateus@marea.mx',
    subject: 'Year-end tax documents',
    snippet: 'Everything is in order - thanks for chasing the last two receipts, the filing is complete.',
    body: 'Everything is in order - thanks for chasing the last two receipts, the filing is complete. Copies are attached for your records.',
    receivedAt: daysAgo(20),
    read: true,
    starred: false,
    pinned: false,
  },
  {
    id: 'ml-12',
    mailboxId: MAILBOX_ARCHIVE,
    correspondentName: 'Wanjiru Kamau',
    correspondentEmail: 'wanjiru@designhub.example',
    subject: 'Conference speaker confirmation',
    snippet: 'You are confirmed for the Thursday afternoon slot - the AV team will reach out about slides.',
    body: 'You are confirmed for the Thursday afternoon slot - the AV team will reach out about slides.',
    receivedAt: daysAgo(30),
    read: true,
    starred: false,
    pinned: false,
  },

  // --- Trash: 1 ---
  {
    id: 'ml-13',
    mailboxId: MAILBOX_TRASH,
    correspondentName: 'Billing Notices',
    correspondentEmail: 'no-reply@billing-notices.example',
    subject: 'Your subscription is expiring',
    snippet: 'This is a reminder that your subscription will expire soon - renew now to avoid interruption.',
    body: 'This is a reminder that your subscription will expire soon - renew now to avoid interruption.',
    receivedAt: daysAgo(9),
    read: true,
    starred: false,
    pinned: false,
  },
];

/**
 * Earlier messages, oldest first, for the two mails whose reading pane shows
 * an "N earlier messages" toggle. Every other mail has none, which is what
 * keeps the toggle off their reading pane entirely.
 */
export const mailMessages: MailMessage[] = [
  {
    id: 'mm-2-1',
    mailId: 'ml-2',
    correspondentName: 'Alex Rivera',
    correspondentEmail: 'alex@brightlabs.io',
    date: calendarText(hoursAgo(26)),
    body: 'Could we get staging access set up for the new build? Devon on your side mentioned you handle provisioning.',
  },
  {
    id: 'mm-2-2',
    mailId: 'ml-2',
    correspondentName: 'Devon Ashworth',
    correspondentEmail: 'devon@brightlabs.io',
    date: calendarText(hoursAgo(24)),
    body: 'Sure, I will have it ready by tomorrow - sending the credentials in a separate email for security.',
  },
  {
    id: 'mm-11-1',
    mailId: 'ml-11',
    correspondentName: 'Alex Rivera',
    correspondentEmail: 'alex@northstar.io',
    date: calendarText(daysAgo(24)),
    body: 'Starting on the year-end filing - I count two receipts missing from the folder you shared, can you send those over?',
  },
  {
    id: 'mm-11-2',
    mailId: 'ml-11',
    correspondentName: 'Mateus Rocha',
    correspondentEmail: 'mateus@marea.mx',
    date: calendarText(daysAgo(22)),
    body: 'Found them - both attached now. Apologies, they were filed under the wrong quarter.',
  },
];
