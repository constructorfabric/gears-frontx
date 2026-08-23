import { describe, expect, it } from 'vitest';
import { CHANNEL_GENERAL, CHANNEL_SALES, CHANNEL_SUPPORT, contacts, conversations } from '../../api/dataset';
import type { Contact } from '../../api/types';
import { countOpen, selectConversations } from './conversationOrdering';

const contactsById = new Map<string, Contact>(contacts.map((contact) => [contact.id, contact]));

const select = (channelId: string, search = '', sort: 'last-activity' | 'oldest' | 'priority' | 'unread' = 'last-activity') =>
  selectConversations(conversations, contactsById, channelId, search, sort);

describe('selectConversations', () => {
  it('shows one channel at a time', () => {
    expect(select(CHANNEL_GENERAL)).toHaveLength(3);
    expect(select(CHANNEL_SUPPORT)).toHaveLength(4);
    expect(select(CHANNEL_SALES)).toHaveLength(2);
  });

  it('narrows the list and the open counter together as the agent types', () => {
    const all = select(CHANNEL_GENERAL);
    expect(countOpen(all)).toBe(3);

    const matching = select(CHANNEL_GENERAL, 'csv');

    expect(matching.map((conversation) => conversation.subject)).toEqual([
      'Feature request: CSV export',
    ]);
    expect(countOpen(matching)).toBe(1);
  });

  it('matches the contact behind a conversation, not only its own text', () => {
    const matching = select(CHANNEL_SUPPORT, 'noah williams');

    expect(matching.map((conversation) => conversation.subject)).toEqual([
      'Dark mode toggle not persisting',
    ]);
  });

  it('orders by the chosen key and falls back to recency on a tie', () => {
    const instants = (order: 'last-activity' | 'oldest') =>
      select(CHANNEL_SUPPORT, '', order).map((conversation) =>
        Date.parse(conversation.lastActivityAt)
      );

    // Monotonic rather than a strict reversal of one another: the sort is
    // stable, so two conversations sharing an instant keep their relative
    // order whichever direction is asked for.
    expect(instants('last-activity')).toEqual([...instants('last-activity')].sort((a, b) => b - a));
    expect(instants('oldest')).toEqual([...instants('oldest')].sort((a, b) => a - b));

    expect(select(CHANNEL_SALES, '', 'priority')[0].priority).toBe('high');

    const byUnread = select(CHANNEL_SALES, '', 'unread');
    expect(byUnread[0].unreadCount).toBe(2);
    // The refund thread carries two unread messages, ahead of the license one.
    expect(byUnread[0].id).toBe('c-2');
  });
});
