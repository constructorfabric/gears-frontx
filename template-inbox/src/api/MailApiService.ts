/**
 * Mail domain - API service.
 *
 * A sibling of `InboxApiService`, built from the exact same primitives
 * (`RestProtocol`, `RestEndpointProtocol`, the app's own `RestMockPlugin`) and
 * the same `useMocks` on/off seam - see `InboxApiService`'s doc comment for
 * why that plugin is the app's own file rather than the ecosystem package's.
 * Nothing new is invented here, only pointed at a different base URL and a
 * different mock map.
 */

import { BaseApiService, RestEndpointProtocol, RestProtocol } from '@gears-frontx/api';
import { mailMockMap } from './mailMocks';
import { RestMockPlugin } from './RestMockPlugin';
import type { GetMailboxesResponse, GetMailMessagesResponse, GetMailsResponse } from './mailTypes';

export class MailApiService extends BaseApiService {
  private readonly rest: RestProtocol;
  private readonly mockPlugin: RestMockPlugin;

  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);

    super({ baseURL: '/api/mail' }, restProtocol, restEndpoints);

    this.rest = restProtocol;
    this.mockPlugin = new RestMockPlugin({ mockMap: mailMockMap, delay: 100 });

    this.registerPlugin(restProtocol, this.mockPlugin);
  }

  /** Same seam as `InboxApiService.useMocks` - on is what a seeded project
   * boots with, off is the whole migration to a real backend. */
  useMocks(enabled: boolean): void {
    if (enabled) {
      this.rest.plugins.add(this.mockPlugin);
    } else {
      this.rest.plugins.remove(this.mockPlugin);
    }
  }

  readonly getMailboxes =
    this.protocol(RestEndpointProtocol).query<GetMailboxesResponse>('/mailboxes');

  readonly getMails = this.protocol(RestEndpointProtocol).query<GetMailsResponse>('/mails');

  readonly getMailMessages =
    this.protocol(RestEndpointProtocol).query<GetMailMessagesResponse>('/messages');
}
