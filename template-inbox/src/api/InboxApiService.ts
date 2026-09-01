/**
 * Inbox domain - API service.
 *
 * One service backs both screens. They share a dataset - a contact is a list
 * row, a thread header, a details-panel lead and a table row at the same time -
 * so splitting the surface in two would mean two copies of that dataset kept in
 * step by hand. If the two ever need separate surfaces, keep this one data
 * module and put two thin services over it.
 */

import { BaseApiService, RestEndpointProtocol, RestProtocol } from '@gears-frontx/api';
import { inboxMockMap } from './mocks';
import { RestMockPlugin } from './RestMockPlugin';
import type {
  GetAgentResponse,
  GetChannelsResponse,
  GetContactsResponse,
  GetConversationsResponse,
  GetMessagesResponse,
  PostMessageRequest,
  PostMessageResponse,
} from './types';

export class InboxApiService extends BaseApiService {
  private readonly rest: RestProtocol;
  private readonly mockPlugin: RestMockPlugin;

  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);

    super({ baseURL: '/api/inbox' }, restProtocol, restEndpoints);

    this.rest = restProtocol;
    this.mockPlugin = new RestMockPlugin({ mockMap: inboxMockMap, delay: 100 });

    // `registerPlugin` declares the plugin; it deliberately does not switch it
    // on, so that whether mocks answer stays a decision made outside the
    // service. `useMocks` below is where this app makes it.
    this.registerPlugin(restProtocol, this.mockPlugin);
  }

  /**
   * Whether the mock map answers requests instead of the network.
   *
   * On is what a seeded project boots with, because the dataset is the product
   * demo. Turning it off is the whole migration to a real backend: the
   * endpoints, the response types and every screen stay exactly as they are,
   * and the requests below start reaching `/api/inbox` for real.
   */
  useMocks(enabled: boolean): void {
    if (enabled) {
      this.rest.plugins.add(this.mockPlugin);
    } else {
      this.rest.plugins.remove(this.mockPlugin);
    }
  }

  readonly getAgent = this.protocol(RestEndpointProtocol).query<GetAgentResponse>('/me');

  readonly getChannels =
    this.protocol(RestEndpointProtocol).query<GetChannelsResponse>('/channels');

  readonly getConversations =
    this.protocol(RestEndpointProtocol).query<GetConversationsResponse>('/conversations');

  readonly getMessages =
    this.protocol(RestEndpointProtocol).query<GetMessagesResponse>('/messages');

  readonly getContacts =
    this.protocol(RestEndpointProtocol).query<GetContactsResponse>('/contacts');

  readonly postMessage = this.protocol(RestEndpointProtocol).mutation<
    PostMessageResponse,
    PostMessageRequest
  >('POST', '/messages');
}
