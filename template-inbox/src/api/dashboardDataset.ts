/**
 * Dashboard domain - the seeded content, and the only module that holds any.
 *
 * Same discipline as `dataset.ts` and `mailDataset.ts`: instants resolved
 * once at module load as offsets from `ANCHOR_MS`, so the activity table
 * keeps reading "2h ago" on any run day. The activity rows reuse the inbox
 * dataset's `contacts` for identity (`contactId`) rather than inventing a
 * second set of people - the same continuity `Conversation.contactId`
 * already relies on.
 *
 * Every number a card displays is either read straight from a field here or
 * computed from one (a sum, an average, a delta) in the screen that renders
 * it - nothing is hardcoded in a component.
 */

import { contacts } from './dataset';
import type {
  ActivityItem,
  ActivityKind,
  ActivityStatus,
  ContactStageSegment,
  DashboardKpiCard,
  NewContactsSeries,
  RecordsCreatedPoint,
  ResolvedPerDayPoint,
  TopAgent,
  WorkloadMetric,
} from './dashboardTypes';

const ANCHOR_MS = Date.now();

const hoursAgo = (hours: number): string => new Date(ANCHOR_MS - hours * 3_600_000).toISOString();

const daysAgo = (days: number): string => hoursAgo(days * 24);

const weekdayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

/** The last 7 calendar days including today, oldest first - every chart on
 * this screen that plots a week shares this label set so the x-axes agree. */
export const LAST_7_DAYS: string[] = Array.from({ length: 7 }, (_, index) =>
  weekdayFormat.format(new Date(ANCHOR_MS - (6 - index) * 24 * 3_600_000))
);

/**
 * The agent roster this screen's "owner" columns draw from. Alex Rivera is
 * the same agent identity `dataset.ts` seeds as the signed-in user in Chat
 * and Mail - the dashboard is that agent's own team's view, so their name
 * belongs in the roster rather than only in the rail's profile menu.
 */
export const dashboardAgents = ['Alex Rivera', 'Nina Petrov', 'Sam Okafor', 'Jordan Blake', 'Yusuf Demir'];

export const kpiCards: DashboardKpiCard[] = [
  {
    id: 'open-conversations',
    label: 'Open conversations',
    unit: 'count',
    chartType: 'area',
    valueMode: 'last',
    // Trending down over the week - a shrinking backlog, which is the good
    // direction for an open-item count (see `goodWhenPositive` below).
    series: [34, 32, 33, 29, 27, 26, 24],
    previousValue: 33,
    goodWhenPositive: false,
    footerLabel: 'Unassigned',
    footerValue: 3,
    footerUnit: 'count',
  },
  {
    id: 'resolved-this-week',
    label: 'Resolved this week',
    unit: 'count',
    chartType: 'bar',
    valueMode: 'sum',
    series: [16, 20, 24, 29, 22, 18, 21],
    // A slightly softer week than the one before it - deliberately, so this
    // row's badges are not four identical greens (see the dashboard spec's
    // "varied and alive" note).
    previousValue: 165,
    goodWhenPositive: true,
    footerLabel: 'Reopened',
    footerValue: 2,
    footerUnit: 'count',
  },
  {
    id: 'avg-first-response',
    label: 'Avg first response',
    unit: 'minutes',
    chartType: 'line',
    valueMode: 'last',
    // Trending down - a faster response time, the good direction for a
    // duration metric.
    series: [14, 13, 15, 12, 11, 10, 9],
    previousValue: 13,
    goodWhenPositive: false,
    footerLabel: 'Fastest reply',
    footerValue: 4,
    footerUnit: 'minutes',
  },
];

/**
 * Row 1's fourth card, "Contacts by stage" - a five-segment donut replacing
 * the old "Team utilization" radial gauge. Counts are seeded directly
 * (`dataset.ts`'s `contacts` collection carries no lifecycle-stage field of
 * its own, the same way `workload`/`topAgents` are their own seeded
 * collections rather than derived from another one); every percentage the
 * card shows is computed from these counts at render, never stored (see
 * `contactsByStagePercent`).
 */
export const contactsByStage: ContactStageSegment[] = [
  { id: 'prospect', label: 'Prospect', count: 15 },
  { id: 'engaged', label: 'Engaged', count: 14 },
  { id: 'customer', label: 'Customer', count: 20 },
  { id: 'at-risk', label: 'At risk', count: 7 },
  { id: 'churned', label: 'Churned', count: 4 },
];

/** "Resolved per day", row 2's large bar chart. Shares its trend shape with
 * the "Resolved this week" KPI card above on purpose - both describe the
 * same underlying resolutions, one as a sparkline and one at full size. */
export const resolvedPerDay: ResolvedPerDayPoint[] = LAST_7_DAYS.map((day, index) => ({
  day,
  value: kpiCards[1].series[index],
}));

export const newContacts: NewContactsSeries = {
  series: LAST_7_DAYS.map((day, index) => ({
    day,
    inbound: [9, 11, 8, 14, 12, 16, 19][index],
    outbound: [3, 4, 5, 6, 7, 8, 9][index],
  })),
  previousTotal: 108,
};

/** The Summary card's small trend line - overall activity volume, not just
 * resolutions, so it reads differently from `resolvedPerDay` beside it. */
export const summaryTrend: number[] = [30, 34, 31, 38, 36, 41, 44];

/** The last 12 calendar months, oldest first - "Records created"'s own x-axis,
 * independent of `LAST_7_DAYS` since this card plots a full year rather than
 * a week. */
const MONTHS_12: string[] = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
    new Date(ANCHOR_MS - (11 - index) * 30 * 24 * 3_600_000)
  )
);

/**
 * "Records created" - row 3's line chart. Three record types with distinct
 * shapes, on purpose: Companies stays low and steady, Opportunities is the
 * wavy one with a late spike, People climbs toward the most recent month -
 * three lines that read as different instruments rather than the same trend
 * repeated three times. The card's headline total is computed from these
 * (see `recordsCreatedTotal`), never stored separately.
 */
export const recordsCreated: RecordsCreatedPoint[] = MONTHS_12.map((month, index) => ({
  month,
  companies: [5, 3, 4, 5, 5, 4, 3, 6, 5, 4, 5, 3][index],
  opportunities: [7, 10, 6, 9, 11, 7, 9, 8, 8, 8, 7, 18][index],
  people: [10, 6, 7, 9, 9, 7, 10, 8, 8, 10, 8, 14][index],
}));

export const workload: WorkloadMetric[] = [
  { id: 'support-load', label: 'Support load', value: 34, max: 50 },
  { id: 'dev-backlog', label: 'Dev backlog', value: 18, max: 40 },
  { id: 'crm-tasks', label: 'CRM tasks', value: 26, max: 35 },
  { id: 'qa-reviews', label: 'QA reviews', value: 12, max: 20 },
];

export const topAgents: TopAgent[] = [
  { id: 'agent-alex-rivera', name: 'Alex Rivera', resolvedCount: 42 },
  { id: 'agent-nina-petrov', name: 'Nina Petrov', resolvedCount: 38 },
  { id: 'agent-sam-okafor', name: 'Sam Okafor', resolvedCount: 31 },
  { id: 'agent-jordan-blake', name: 'Jordan Blake', resolvedCount: 27 },
  { id: 'agent-yusuf-demir', name: 'Yusuf Demir', resolvedCount: 19 },
];

/**
 * "Recent activity", row 4's table. Generated from a small cycle of kinds,
 * statuses and agents rather than handwritten row by row - the table needs
 * enough rows for pagination to mean something (26, two full pages at the
 * kit's default page size of 10), and a hand-typed list that long would
 * carry no more information than this deterministic cycle does. Every
 * `contactId` still points at a real seeded contact, and every timestamp is
 * still anchor-relative like the rest of this file.
 */
const ACTIVITY_KINDS: ActivityKind[] = ['chat', 'mail', 'task'];
const ACTIVITY_STATUSES: ActivityStatus[] = ['open', 'pending', 'resolved', 'escalated', 'resolved'];
const ACTIVITY_ROW_COUNT = 26;

export const activity: ActivityItem[] = Array.from({ length: ACTIVITY_ROW_COUNT }, (_, index) => {
  const contact = contacts[index % contacts.length];
  return {
    id: `act-${index + 1}`,
    contactId: contact.id,
    kind: ACTIVITY_KINDS[index % ACTIVITY_KINDS.length],
    status: ACTIVITY_STATUSES[index % ACTIVITY_STATUSES.length],
    ownerAgentName: dashboardAgents[index % dashboardAgents.length],
    occurredAt:
      index % 5 === 0 ? daysAgo(1 + (index % 6)) : hoursAgo(1 + ((index * 3) % 30)),
  };
});
