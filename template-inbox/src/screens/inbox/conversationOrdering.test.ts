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
    // Support's own c-1 is seeded pinned (see dataset.ts) and is also its
    // OLDEST row by activity - the strongest case that a pin overrides
    // recency rather than merely tie-breaking it. Excluded from the
    // monotonic check below on purpose: pinned rows sort first regardless
    // of `order`, so only the UNPINNED remainder is still monotonic in the
    // chosen key.
    const unpinnedInstants = (order: 'last-activity' | 'oldest') =>
      select(CHANNEL_SUPPORT, '', order)
        .filter((conversation) => !conversation.pinned)
        .map((conversation) => Date.parse(conversation.lastActivityAt));

    // Monotonic rather than a strict reversal of one another: the sort is
    // stable, so two conversations sharing an instant keep their relative
    // order whichever direction is asked for.
    expect(unpinnedInstants('last-activity')).toEqual(
      [...unpinnedInstants('last-activity')].sort((a, b) => b - a)
    );
    expect(unpinnedInstants('oldest')).toEqual(
      [...unpinnedInstants('oldest')].sort((a, b) => a - b)
    );

    // The pin wins over every sort order, including one where the pinned
    // row is the LEAST recently active conversation in the channel.
    expect(select(CHANNEL_SUPPORT, '', 'last-activity')[0].id).toBe('c-1');
    expect(select(CHANNEL_SUPPORT, '', 'oldest')[0].id).toBe('c-1');

    expect(select(CHANNEL_SALES, '', 'priority')[0].priority).toBe('high');

    const byUnread = select(CHANNEL_SALES, '', 'unread');
    expect(byUnread[0].unreadCount).toBe(2);
    // The refund thread carries two unread messages, ahead of the license one
    // - and is pinned, so it leads even under the other sort orders too.
    expect(byUnread[0].id).toBe('c-2');
  });
});
