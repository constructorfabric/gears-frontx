import { describe, expect, it } from 'vitest';
import type { Mail } from '../../api/mailTypes';
import { countInMailbox, countUnreadInMailbox, selectMails } from './mailSelectors';

const mail = (overrides: Partial<Mail>): Mail => ({
  id: 'ml-0',
  mailboxId: 'inbox',
  correspondentName: 'Test Sender',
  correspondentEmail: 'sender@example.com',
  subject: 'Subject',
  snippet: 'Snippet',
  body: 'Body',
  receivedAt: new Date().toISOString(),
  read: true,
  starred: false,
  ...overrides,
});

const mails: Mail[] = [
  mail({ id: 'ml-1', mailboxId: 'inbox', read: false, correspondentName: 'Priya Natarajan', subject: 'Q3 planning' }),
  mail({ id: 'ml-2', mailboxId: 'inbox', read: true, correspondentName: 'Devon Ashworth', subject: 'Staging access' }),
  mail({ id: 'ml-3', mailboxId: 'drafts', read: true, correspondentName: 'Ava Laurent', subject: 'Invoice' }),
];

describe('selectMails', () => {
  it('narrows to the selected mailbox', () => {
    expect(selectMails(mails, 'inbox', 'all', '').map((m) => m.id)).toEqual(['ml-1', 'ml-2']);
    expect(selectMails(mails, 'drafts', 'all', '').map((m) => m.id)).toEqual(['ml-3']);
  });

  it('filters to unread within the selected mailbox', () => {
    expect(selectMails(mails, 'inbox', 'unread', '').map((m) => m.id)).toEqual(['ml-1']);
  });

  it('filters by correspondent and subject, case-insensitively', () => {
    expect(selectMails(mails, 'inbox', 'all', 'devon').map((m) => m.id)).toEqual(['ml-2']);
    expect(selectMails(mails, 'inbox', 'all', 'PLANNING').map((m) => m.id)).toEqual(['ml-1']);
    expect(selectMails(mails, 'inbox', 'all', 'nothing matches')).toEqual([]);
  });
});

describe('mailbox counts', () => {
  it('counts every mail and every unread mail in a mailbox', () => {
    expect(countInMailbox(mails, 'inbox')).toBe(2);
    expect(countInMailbox(mails, 'drafts')).toBe(1);
    expect(countInMailbox(mails, 'sent')).toBe(0);
    expect(countUnreadInMailbox(mails, 'inbox')).toBe(1);
    expect(countUnreadInMailbox(mails, 'drafts')).toBe(0);
  });
});
