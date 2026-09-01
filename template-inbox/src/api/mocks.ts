/**
 * Inbox domain - the mock map for `InboxApiService`.
 *
 * Keys are the full `METHOD /path` the plugin matches on, baseURL included.
 * Every read hands back a whole collection: `RestMockPlugin` calls a factory
 * with the request body alone, so a factory behind a `:id` pattern could not
 * tell which id matched even if one were declared. Screens select from the
 * collection they already hold.
 */

import type { JsonValue, MockMap } from '@gears-frontx/api';
import { agent, channels, contacts, conversations, messages } from './dataset';
import type {
  GetAgentResponse,
  GetChannelsResponse,
  GetContactsResponse,
  GetConversationsResponse,
  GetMessagesResponse,
  Message,
  PostMessageResponse,
} from './types';

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

/**
 * The transcript's own calendar-text format, matched to the seeded messages so
 * a message the agent has just sent reads like the ones above it.
 */
const formatTranscriptTimestamp = (at: Date): string =>
  `${dateFormat.format(at)} - ${timeFormat.format(at)}`;

/** Server-side id sequence for messages this session posted. */
let postedMessageCount = 0;

const readString = (body: JsonValue | undefined, field: string): string => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return '';
  const value = body[field];
  return typeof value === 'string' ? value : '';
};

/**
 * Echoes the posted reply or note back as a stored message. A real backend
 * would assign the id and the timestamp exactly here, which is why neither is
 * taken from the request.
 */
const acceptPostedMessage = (body: JsonValue | undefined): Message => {
  postedMessageCount += 1;
  return {
    id: `m-sent-${postedMessageCount}`,
    conversationId: readString(body, 'conversationId'),
    direction: 'outbound',
    kind: 'text',
    body: readString(body, 'body'),
    links: [],
    imageUrl: null,
    timestamp: formatTranscriptTimestamp(new Date()),
    // Nothing has been delivered yet, so a fresh reply carries no receipt; a
    // note never gets one at all.
    seen: false,
    internal: readString(body, 'kind') === 'note',
    attachments: [],
  };
};

export const inboxMockMap: MockMap = {
  'GET /api/inbox/me': (): GetAgentResponse => ({ agent }),
  'GET /api/inbox/channels': (): GetChannelsResponse => ({ channels }),
  'GET /api/inbox/conversations': (): GetConversationsResponse => ({ conversations }),
  'GET /api/inbox/messages': (): GetMessagesResponse => ({ messages }),
  'GET /api/inbox/contacts': (): GetContactsResponse => ({ contacts }),
  'POST /api/inbox/messages': (body): PostMessageResponse => ({
    message: acceptPostedMessage(body),
  }),
};
