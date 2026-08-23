/**
 * Mail domain - API response contracts.
 *
 * A sibling of `types.ts`, not an extension of it: mail shares no collection
 * with the chat/contacts domain, so it gets its own contracts, its own
 * dataset and its own service (`MailApiService`) rather than a new field
 * bolted onto `Conversation`. See `InboxApiService`'s own doc comment for
 * when the split the other way - one service over one dataset - is the right
 * call; here the two domains do not overlap at all.
 *
 * Every shape here crosses the mock boundary as JSON, same constraint as
 * `types.ts`: no `Date`, no `Map`, no method on any field.
 */

/** No Spam mailbox: this product does not ship one. */
export type MailboxId = 'inbox' | 'drafts' | 'sent' | 'archive' | 'trash';

export type Mailbox = {
  id: MailboxId;
  label: string;
};

/**
 * One mail, list row and reading-pane header in one shape. `body` and
 * `receivedAt` describe the newest message in the thread - the one the
 * reading pane renders flat, outside any card - and `snippet` is that same
 * message's own preview text, truncated by the list row's line clamp.
 * Anything older is a separate `MailMessage` row keyed by `mailId`.
 */
export type Mail = {
  id: string;
  mailboxId: MailboxId;
  correspondentName: string;
  correspondentEmail: string;
  subject: string;
  snippet: string;
  /** The newest message's body, pre-wrap text. */
  body: string;
  /** ISO instant of the newest message. */
  receivedAt: string;
  read: boolean;
  starred: boolean;
};

/**
 * An earlier message in a mail's history, oldest first. Only mails with a
 * history worth collapsing get any rows here - most mails have none, and the
 * reading pane's "N earlier messages" toggle simply does not render for them.
 */
export type MailMessage = {
  id: string;
  mailId: string;
  correspondentName: string;
  correspondentEmail: string;
  /** Calendar text, same convention as `Message.timestamp` in `types.ts`. */
  date: string;
  body: string;
};

export type GetMailboxesResponse = { mailboxes: Mailbox[] };
export type GetMailsResponse = { mails: Mail[] };
export type GetMailMessagesResponse = { mailMessages: MailMessage[] };
