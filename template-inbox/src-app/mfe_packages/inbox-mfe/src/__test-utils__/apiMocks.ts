import { vi } from 'vitest';
import { agent, contacts, conversations, folders, messages } from '../api/dataset';

/**
 * Stands in for the whole query layer of a screen.
 *
 * Each endpoint descriptor is replaced by a tag, and `useApiQuery` answers
 * from the seeded dataset by that tag. The screens are therefore tested
 * against the content this template actually ships, without standing a
 * QueryClient, a FrontX app instance and the mock plugin up around them.
 */
export const endpointTags = {
  getAgent: { tag: 'agent' },
  getFolders: { tag: 'folders' },
  getConversations: { tag: 'conversations' },
  getMessages: { tag: 'messages' },
  getContacts: { tag: 'contacts' },
  postMessage: { tag: 'postMessage' },
} as const;

const RESPONSES: Record<string, unknown> = {
  agent: { agent },
  folders: { folders },
  conversations: { conversations },
  messages: { messages },
  contacts: { contacts },
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
  isFetching: false,
  isError: false,
});

export const mutationResult = () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  error: null,
  data: undefined,
  reset: vi.fn(),
});
