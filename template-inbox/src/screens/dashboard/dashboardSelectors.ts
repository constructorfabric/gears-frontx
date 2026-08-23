/**
 * How every number the dashboard displays is derived, and how a delta's sign
 * is read as good or bad news.
 *
 * Kept out of the components for the same reason `mailSelectors.ts` is: it
 * is the one part of the screen with rules rather than markup, and every
 * card reads a KPI's `value`/delta through these functions rather than a
 * stored, independently-drifting number - see `DashboardApiService`'s own
 * doc comment on that constraint.
 */

import type {
  ContactStageSegment,
  DashboardKpiCard,
  NewContactsSeries,
  RecordsCreatedPoint,
  ResolvedPerDayPoint,
  WorkloadMetric,
} from '../../api/dashboardTypes';

export const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export const average = (values: number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;

/** A KPI card's headline number: the latest day for a live snapshot, the
 * whole week's total for a period sum - see `DashboardKpiValueMode`. */
export const kpiValue = (kpi: DashboardKpiCard): number =>
  kpi.valueMode === 'sum' ? sum(kpi.series) : kpi.series[kpi.series.length - 1];

/** Percent change of the headline value against the card's own prior-period
 * comparison, rounded to one decimal place. */
export const kpiDeltaPercent = (kpi: DashboardKpiCard): number => {
  const value = kpiValue(kpi);
  if (kpi.previousValue === 0) return value === 0 ? 0 : 100;
  return Math.round(((value - kpi.previousValue) / kpi.previousValue) * 1000) / 10;
};

export type DeltaTone = 'success' | 'danger' | 'secondary';

/**
 * Whether a delta reads as good, bad, or flat news, given the metric's own
 * direction. A rising "Resolved this week" is good news (`goodWhenPositive`
 * true); a rising "Open conversations" is a growing backlog, so the same
 * positive sign reads as `danger` there instead.
 */
export const deltaTone = (deltaPercent: number, goodWhenPositive: boolean): DeltaTone => {
  if (deltaPercent === 0) return 'secondary';
  const isRise = deltaPercent > 0;
  const isGoodNews = isRise === goodWhenPositive;
  return isGoodNews ? 'success' : 'danger';
};

/** "+12.4%" / "-8.3%" / "0%" - the delta badge's own label text, since a
 * tone alone is never a substitute for spelling the value out (see Badge's
 * accessibility note). */
export const formatDeltaPercent = (deltaPercent: number): string =>
  `${deltaPercent > 0 ? '+' : ''}${deltaPercent}%`;

const numberFormat = new Intl.NumberFormat('en-US');

export const formatCount = (value: number): string => numberFormat.format(value);

/** A KPI's headline value, formatted for its own unit. */
export const formatKpiValue = (kpi: DashboardKpiCard, value: number = kpiValue(kpi)): string => {
  if (kpi.unit === 'minutes') return `${value}m`;
  if (kpi.unit === 'percent') return `${value}%`;
  return numberFormat.format(value);
};

/** A KPI's footer stat, formatted for its own (independent) unit. */
export const formatKpiFooterValue = (kpi: DashboardKpiCard): string =>
  kpi.footerUnit === 'minutes' ? `${kpi.footerValue}m` : numberFormat.format(kpi.footerValue);

/** The combined (inbound + outbound) total across a "New contacts" series. */
export const newContactsTotal = (series: NewContactsSeries['series']): number =>
  sum(series.map((point) => point.inbound + point.outbound));

export const newContactsDeltaPercent = (newContacts: NewContactsSeries): number => {
  const total = newContactsTotal(newContacts.series);
  if (newContacts.previousTotal === 0) return total === 0 ? 0 : 100;
  return Math.round(((total - newContacts.previousTotal) / newContacts.previousTotal) * 1000) / 10;
};

export const newContactsInboundTotal = (newContacts: NewContactsSeries): number =>
  sum(newContacts.series.map((point) => point.inbound));

export const newContactsOutboundTotal = (newContacts: NewContactsSeries): number =>
  sum(newContacts.series.map((point) => point.outbound));

/** A "Resolved per day" point's own daily total across its three stacked
 * sources - never stored, always the sum of `chat`/`mail`/`tasks`. */
export const resolvedPerDayTotal = (point: ResolvedPerDayPoint): number =>
  point.chat + point.mail + point.tasks;

/** The whole week's resolutions across every day and every source - the
 * same number the "Resolved this week" KPI card sums independently, kept
 * consistent because both read from the same seeded per-source series. */
export const resolvedPerDayWeekTotal = (data: ResolvedPerDayPoint[]): number =>
  sum(data.map(resolvedPerDayTotal));

/** A workload metric's fill percentage for its Progress bar. */
export const workloadPercent = (metric: WorkloadMetric): number =>
  metric.max === 0 ? 0 : Math.round((metric.value / metric.max) * 100);

/** "Records created"'s headline: every company, opportunity and person
 * across the whole 12-month series, summed - the card's big number is never
 * its own stored field. */
export const recordsCreatedTotal = (series: RecordsCreatedPoint[]): number =>
  sum(series.map((point) => point.companies + point.opportunities + point.people));

/** A "Contacts by stage" segment's share of the whole donut, as a rounded
 * whole percent - the donut's own legend shows this instead of a stored
 * field, so five segments read consistently as roughly 100% together. */
export const contactsByStagePercent = (
  segment: ContactStageSegment,
  segments: ContactStageSegment[]
): number => {
  const total = sum(segments.map((item) => item.count));
  return total === 0 ? 0 : Math.round((segment.count / total) * 100);
};
