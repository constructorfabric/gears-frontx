import { vi } from 'vitest';
import { agent, channels, contacts, conversations, messages } from '../api/dataset';
import { mailboxes, mailMessages, mails } from '../api/mailDataset';

/**
 * Stands in for the whole query layer of a screen.
 *
 * Each endpoint descriptor is replaced by a tag, and `useApiQuery` answers
 * from the seeded dataset by that tag. The screens are therefore tested
 * against the content this template actually ships, without standing the API
 * service, its protocols and its mock plugin up around them. One tag map
 * covers both domains: `InboxScreen.test.tsx` and `MailScreen.test.tsx` each
 * mock only the registry getter their own screen calls, so the unused half
 * of this map is simply never read.
 */
export const endpointTags = {
  getAgent: { tag: 'agent' },
  getChannels: { tag: 'channels' },
  getConversations: { tag: 'conversations' },
  getMessages: { tag: 'messages' },
  getContacts: { tag: 'contacts' },
  postMessage: { tag: 'postMessage' },
  getMailboxes: { tag: 'mailboxes' },
  getMails: { tag: 'mails' },
  getMailMessages: { tag: 'mailMessages' },
} as const;

const RESPONSES: Record<string, unknown> = {
  agent: { agent },
  channels: { channels },
  conversations: { conversations },
  messages: { messages },
  contacts: { contacts },
  mailboxes: { mailboxes },
  mails: { mails },
  mailMessages: { mailMessages },
};

const tagOf = (endpoint: unknown): string => {
  // `in` narrows an `unknown` object to one carrying the key, so the read
  // below needs no assertion about a shape this module made up itself.
  if (typeof endpoint !== 'object' || endpoint === null || !('tag' in endpoint)) return '';
  return typeof endpoint.tag === 'string' ? endpoint.tag : '';
};

export const queryResultFor = (endpoint: unknown) => ({
  data: RESPONSES[tagOf(endpoint)],
  error: null,
  isLoading: false,
});

export const mutationResult = () => ({
  mutate: vi.fn(),
  isPending: false,
  error: null,
});
