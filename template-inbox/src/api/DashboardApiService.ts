/**
 * Dashboard domain - API service.
 *
 * A sibling of `MailApiService`, built from the same primitives and the same
 * `useMocks` on/off seam. One difference from both siblings: the dashboard
 * is a single coherent view rather than a set of independently-browsable
 * collections, so it exposes one endpoint (`getDashboard`) that answers with
 * every section's data together, instead of one endpoint per section. A
 * project that grows the dashboard into something with independently
 * loading widgets can split this the same way `InboxApiService`'s own doc
 * comment describes splitting a service in two.
 */

import { BaseApiService, RestEndpointProtocol, RestProtocol } from '@gears-frontx/api';
import { dashboardMockMap } from './dashboardMocks';
import { RestMockPlugin } from './RestMockPlugin';
import type { GetDashboardResponse } from './dashboardTypes';

export class DashboardApiService extends BaseApiService {
  private readonly rest: RestProtocol;
  private readonly mockPlugin: RestMockPlugin;

  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);

    super({ baseURL: '/api/dashboard' }, restProtocol, restEndpoints);

    this.rest = restProtocol;
    this.mockPlugin = new RestMockPlugin({ mockMap: dashboardMockMap, delay: 100 });

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

  readonly getDashboard =
    this.protocol(RestEndpointProtocol).query<GetDashboardResponse>('/overview');
}
