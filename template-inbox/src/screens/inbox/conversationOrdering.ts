/**
 * How the list pane narrows and orders what it shows.
 *
 * Kept out of the component because it is the one part of the screen with
 * rules rather than markup, and because the counts in the pane header and the
 * toolbar are read off the same result the rows are - a search that narrows
 * the list has to move both.
 */

import type { Contact, Conversation, ConversationPriority } from '../../api/types';

export const SORT_ORDERS = ['last-activity', 'oldest', 'priority', 'unread'] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

export const isSortOrder = (value: unknown): value is SortOrder =>
  typeof value === 'string' && SORT_ORDERS.some((order) => order === value);

/** Highest first, so a bigger number sorts earlier. */
const PRIORITY_RANK: Record<ConversationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

const activityDescending = (left: Conversation, right: Conversation): number =>
  Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);

/** Pinned before unpinned, ahead of every other tiebreak - a pin overrides
 * whatever the chosen sort order would otherwise have done, the same way
 * `selectConversations`'s caller (the list pane) shows a pinned run as its
 * own group before the rest regardless of `sort`. */
const pinnedFirst = (left: Conversation, right: Conversation): number =>
  Number(right.pinned) - Number(left.pinned);

const withPinnedFirst =
  (comparator: (left: Conversation, right: Conversation) => number) =>
  (left: Conversation, right: Conversation): number =>
    pinnedFirst(left, right) || comparator(left, right);

const COMPARATORS: Record<SortOrder, (left: Conversation, right: Conversation) => number> = {
  'last-activity': withPinnedFirst(activityDescending),
  oldest: withPinnedFirst((left, right) => -activityDescending(left, right)),
  priority: withPinnedFirst(
    (left, right) =>
      PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority] ||
      activityDescending(left, right)
  ),
  unread: withPinnedFirst(
    (left, right) => right.unreadCount - left.unreadCount || activityDescending(left, right)
  ),
};

/**
 * Live client-side filtering over the fields a support agent scans: the
 * subject, the last message and who it is from. The mock API answers with the
 * whole collection precisely so this can happen without a round trip.
 */
export function selectConversations(
  conversations: Conversation[],
  contactsById: Map<string, Contact>,
  channelId: string,
  search: string,
  sort: SortOrder
): Conversation[] {
  const needle = search.trim().toLowerCase();
  const matches = conversations.filter((conversation) => {
    if (conversation.channelId !== channelId) return false;
    if (needle === '') return true;
    const contactName = contactsById.get(conversation.contactId)?.name ?? '';
    return (
      conversation.subject.toLowerCase().includes(needle) ||
      conversation.snippet.toLowerCase().includes(needle) ||
      contactName.toLowerCase().includes(needle)
    );
  });

  // `filter` already returned a fresh array, so sorting it in place cannot
  // reorder the collection the query cache holds.
  return matches.sort(COMPARATORS[sort]);
}

export const countOpen = (conversations: Conversation[]): number =>
  conversations.filter((conversation) => conversation.status === 'open').length;
