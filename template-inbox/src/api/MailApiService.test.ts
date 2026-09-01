import { describe, expect, it } from 'vitest';
import { MAILBOX_ARCHIVE, MAILBOX_DRAFTS, MAILBOX_INBOX, MAILBOX_SENT, MAILBOX_TRASH } from './mailDataset';
import { getMailApi, registerApiServices } from './registry';

/**
 * The mail counterpart to `InboxApiService.test.ts` - one suite that goes
 * through the real service, so a project that forgets `useMocks` on this
 * service specifically renders empty panes rather than failing silently.
 */
describe('MailApiService', () => {
  it('answers the mailbox list from the seeded dataset instead of the network', async () => {
    registerApiServices();

    const { mailboxes } = await getMailApi().getMailboxes.fetch();

    expect(mailboxes.map((mailbox) => mailbox.id)).toEqual([
      MAILBOX_INBOX,
      MAILBOX_DRAFTS,
      MAILBOX_SENT,
      MAILBOX_ARCHIVE,
      MAILBOX_TRASH,
    ]);
    // No Spam mailbox: the owner dropped it from the product.
    expect(mailboxes).toHaveLength(5);
  });

  it('serves every mail the mailbox counts are computed from', async () => {
    registerApiServices();

    const { mails } = await getMailApi().getMails.fetch();

    expect(mails.filter((mail) => mail.mailboxId === MAILBOX_INBOX)).toHaveLength(6);
    expect(mails.filter((mail) => mail.mailboxId === MAILBOX_DRAFTS)).toHaveLength(2);
    expect(mails.filter((mail) => mail.mailboxId === MAILBOX_SENT)).toHaveLength(2);
    expect(mails.filter((mail) => mail.mailboxId === MAILBOX_ARCHIVE)).toHaveLength(2);
    expect(mails.filter((mail) => mail.mailboxId === MAILBOX_TRASH)).toHaveLength(1);
    expect(mails.filter((mail) => !mail.read)).toHaveLength(3);
  });

  it('serves the history behind the two mails that carry one', async () => {
    registerApiServices();

    const { mailMessages } = await getMailApi().getMailMessages.fetch();

    expect(mailMessages.filter((message) => message.mailId === 'ml-2')).toHaveLength(2);
    expect(mailMessages.filter((message) => message.mailId === 'ml-11')).toHaveLength(2);
  });
});
