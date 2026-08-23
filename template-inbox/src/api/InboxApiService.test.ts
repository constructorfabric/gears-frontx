import { describe, expect, it } from 'vitest';
import { CHANNEL_GENERAL, CHANNEL_SALES, CHANNEL_SUPPORT } from './dataset';
import { getInboxApi, registerApiServices } from './registry';

/**
 * The one test that goes through the real service rather than around it.
 *
 * Every other suite here replaces `useApiQuery`, which is the right trade for
 * a screen test and leaves exactly one thing unchecked: whether a request ever
 * reaches the mock map. It does not by default - `registerPlugin` declares a
 * plugin without switching it on - so an app that forgets `useMocks` renders
 * empty panes and no error at all, the request having quietly gone to the
 * network and come back with the dev server's `index.html`. Reading one
 * endpoint end to end is what makes that impossible to ship again.
 */
describe('InboxApiService', () => {
  it('answers from the seeded dataset instead of the network', async () => {
    registerApiServices();

    const { channels } = await getInboxApi().getChannels.fetch();

    expect(channels.map((channel) => channel.id)).toEqual([
      CHANNEL_GENERAL,
      CHANNEL_SUPPORT,
      CHANNEL_SALES,
    ]);
  });

  it('serves every conversation the channels are counted from', async () => {
    registerApiServices();

    const { conversations } = await getInboxApi().getConversations.fetch();

    expect(conversations.filter((c) => c.channelId === CHANNEL_GENERAL)).toHaveLength(3);
    expect(conversations.filter((c) => c.channelId === CHANNEL_SUPPORT)).toHaveLength(4);
    expect(conversations.filter((c) => c.channelId === CHANNEL_SALES)).toHaveLength(2);
  });
});
