/**
 * Dashboard domain - the mock map for `DashboardApiService`.
 *
 * One entry, matching the one endpoint the service exposes - see its own
 * doc comment for why this screen answers through a single collection
 * rather than one per section the way mail's mailboxes/mails/messages do.
 */

import type { MockMap } from '@gears-frontx/api';
import {
  activity,
  kpiCards,
  newContacts,
  resolvedPerDay,
  summaryTrend,
  topAgents,
  workload,
} from './dashboardDataset';
import type { GetDashboardResponse } from './dashboardTypes';

export const dashboardMockMap: MockMap = {
  'GET /api/dashboard/overview': (): GetDashboardResponse => ({
    kpis: kpiCards,
    resolvedPerDay,
    newContacts,
    summaryTrend,
    workload,
    topAgents,
    activity,
  }),
};
