/**
 * Dashboard domain - API response contracts.
 *
 * A sibling of `mailTypes.ts`: its own domain, its own dataset, its own
 * service (`DashboardApiService`). One screen shows one coherent picture, so
 * unlike the mail/inbox split this domain answers through a single endpoint
 * (`getDashboard`) rather than one per section - see `DashboardApiService`'s
 * own doc comment.
 *
 * Every shape here crosses the mock boundary as JSON, same constraint as
 * `types.ts`: no `Date`, no `Map`, no method on any field. Every number a
 * screen displays is either a field here or an arithmetic result computed
 * from one at render - nothing is hardcoded in a component.
 */

/** What kind of value a KPI card's `series` and `value` are measured in. */
export type DashboardKpiUnit = 'count' | 'minutes' | 'percent';

/** How a card's headline `value` is derived from its `series`: the latest
 * point (a live snapshot, e.g. "conversations open right now") or the sum of
 * every point (a period total, e.g. "resolved this week"). */
export type DashboardKpiValueMode = 'last' | 'sum';

export type DashboardChartType = 'area' | 'bar' | 'line';

export type DashboardKpiCard = {
  id: string;
  label: string;
  unit: DashboardKpiUnit;
  chartType: DashboardChartType;
  valueMode: DashboardKpiValueMode;
  /** Oldest to newest, one point per day. */
  series: number[];
  /** The same aggregate (last point or sum, per `valueMode`) for the prior
   * comparable period - what the delta badge is computed against. */
  previousValue: number;
  /** Whether a rising value is the good direction. `false` for a metric
   * where lower is better (open conversations, response time) flips which
   * delta sign reads as `success` versus `danger`. */
  goodWhenPositive: boolean;
  footerLabel: string;
  footerValue: number;
  /** The footer stat's own unit - independent of the card's headline
   * `unit`, since a count-headline card can still footer a duration (e.g.
   * "Avg first response"'s "Fastest reply" stays in minutes either way). */
  footerUnit: 'count' | 'minutes';
};

export type ResolvedPerDayPoint = { day: string; value: number };

/** One month of "Records created": how many of each record type this
 * screen's world creates that month. The card's headline total is never
 * stored - it is the sum of all three fields across every point, computed
 * at render (see `recordsCreatedTotal`). */
export type RecordsCreatedPoint = {
  month: string;
  companies: number;
  opportunities: number;
  people: number;
};

export type NewContactsPoint = { day: string; inbound: number; outbound: number };

export type NewContactsSeries = {
  series: NewContactsPoint[];
  /** Prior period's combined (inbound + outbound) total, for the hero
   * card's delta badge. */
  previousTotal: number;
};

export type WorkloadMetric = {
  id: string;
  label: string;
  value: number;
  max: number;
};

/** One slice of row 1's "Contacts by stage" donut: a contact lifecycle
 * stage and how many contacts currently sit in it. Each segment's share of
 * the ring is computed from `count` at render (see
 * `contactsByStagePercent`), never stored as its own field. */
export type ContactStageSegment = {
  id: string;
  label: string;
  count: number;
};

export type TopAgent = {
  id: string;
  name: string;
  resolvedCount: number;
};

export type ActivityKind = 'chat' | 'mail' | 'task';
export type ActivityStatus = 'open' | 'pending' | 'resolved' | 'escalated';

/**
 * One row of the "Recent activity" table. `contactId` points into the
 * existing inbox dataset's `contacts` collection (see `dataset.ts`) rather
 * than duplicating a name/company pair here - the same continuity reasoning
 * `Conversation.contactId` already follows.
 */
export type ActivityItem = {
  id: string;
  contactId: string;
  kind: ActivityKind;
  status: ActivityStatus;
  ownerAgentName: string;
  /** ISO instant, resolved from the same load-time-anchor convention every
   * other dataset in this app uses. */
  occurredAt: string;
};

export type GetDashboardResponse = {
  kpis: DashboardKpiCard[];
  resolvedPerDay: ResolvedPerDayPoint[];
  newContacts: NewContactsSeries;
  /** The Summary card's small trend line - a 7-point volume trend distinct
   * from `resolvedPerDay` (this one tracks total activity, not just
   * resolutions). */
  summaryTrend: number[];
  /** Row 3's "Records created" line chart - 12 months, oldest first. */
  recordsCreated: RecordsCreatedPoint[];
  /** Row 1's "Contacts by stage" donut - five contact lifecycle stages. */
  contactsByStage: ContactStageSegment[];
  workload: WorkloadMetric[];
  topAgents: TopAgent[];
  activity: ActivityItem[];
};
