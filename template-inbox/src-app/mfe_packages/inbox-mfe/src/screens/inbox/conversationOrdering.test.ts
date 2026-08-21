import { describe, expect, it } from 'vitest';
import { contacts, conversations, FOLDER_SPAM, FOLDER_YOUR_INBOX } from '../../api/dataset';
import type { Contact } from '../../api/types';
import { countOpen, selectConversations } from './conversationOrdering';

const contactsById = new Map<string, Contact>(contacts.map((contact) => [contact.id, contact]));

const select = (folderId: string, search = '', sort: 'last-activity' | 'oldest' | 'priority' | 'unread' = 'last-activity') =>
  selectConversations(conversations, contactsById, folderId, search, sort);

describe('selectConversations', () => {
  it('shows one folder at a time', () => {
    expect(select(FOLDER_YOUR_INBOX)).toHaveLength(7);
    expect(select(FOLDER_SPAM)).toHaveLength(2);
  });

  it('narrows the list and the open counter together as the agent types', () => {
    const all = select(FOLDER_YOUR_INBOX);
    expect(countOpen(all)).toBe(5);

    const matching = select(FOLDER_YOUR_INBOX, 'csv');

    expect(matching.map((conversation) => conversation.subject)).toEqual([
      'Feature request: CSV export',
    ]);
    expect(countOpen(matching)).toBe(1);
  });

  it('matches the contact behind a conversation, not only its own text', () => {
    const matching = select(FOLDER_YOUR_INBOX, 'noah williams');

    expect(matching.map((conversation) => conversation.subject)).toEqual([
      'Dark mode toggle not persisting',
    ]);
  });

  it('orders by the chosen key and falls back to recency on a tie', () => {
    const instants = (order: 'last-activity' | 'oldest') =>
      select(FOLDER_YOUR_INBOX, '', order).map((conversation) =>
        Date.parse(conversation.lastActivityAt)
      );

    // Monotonic rather than a strict reversal of one another: the sort is
    // stable, so two conversations sharing an instant keep their relative
    // order whichever direction is asked for.
    expect(instants('last-activity')).toEqual([...instants('last-activity')].sort((a, b) => b - a));
    expect(instants('oldest')).toEqual([...instants('oldest')].sort((a, b) => a - b));

    expect(select(FOLDER_YOUR_INBOX, '', 'priority')[0].priority).toBe('high');

    const byUnread = select(FOLDER_YOUR_INBOX, '', 'unread');
    expect(byUnread[0].unreadCount).toBe(2);
    // Two conversations carry two unread messages; the more recent one leads.
    expect(byUnread[0].id).toBe('c-2');
  });
});
