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
  GetContactsResponse,
  GetConversationsResponse,
  GetFoldersResponse,
  GetMessagesResponse,
  PostMessageRequest,
  PostMessageResponse,
} from './types';

export class InboxApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);

    super({ baseURL: '/api/inbox' }, restProtocol, restEndpoints);

    this.registerPlugin(
      restProtocol,
      new RestMockPlugin({
        mockMap: inboxMockMap,
        delay: 100,
      })
    );
  }

  readonly getAgent = this.protocol(RestEndpointProtocol).query<GetAgentResponse>('/me');

  readonly getFolders = this.protocol(RestEndpointProtocol).query<GetFoldersResponse>('/folders');

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
