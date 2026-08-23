/**
 * Mail domain - the mock map for `MailApiService`.
 *
 * Same shape as `mocks.ts`: keys are the full `METHOD /path`, every read
 * hands back a whole collection, and selection stays a client-side concern
 * (see `mailSelectors.ts`).
 */

import type { MockMap } from '@gears-frontx/api';
import { mailboxes, mailMessages, mails } from './mailDataset';
import type { GetMailboxesResponse, GetMailMessagesResponse, GetMailsResponse } from './mailTypes';

export const mailMockMap: MockMap = {
  'GET /api/mail/mailboxes': (): GetMailboxesResponse => ({ mailboxes }),
  'GET /api/mail/mails': (): GetMailsResponse => ({ mails }),
  'GET /api/mail/messages': (): GetMailMessagesResponse => ({ mailMessages }),
};
