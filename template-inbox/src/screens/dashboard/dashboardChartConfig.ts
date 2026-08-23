/**
 * The dashboard's chart color system: one `ChartConfig` per chart, all built
 * from the same five-hue palette so a viewer learns "violet is open
 * conversations, green is resolutions" once and it holds across every card.
 *
 * Every hue is an existing kit token rather than a literal color - `--chart-1`
 * through `--chart-5` don't exist in this kit (see the `chart` component's
 * own doc), and a literal hex would only ever hold for one theme. Reading
 * `--primary`/`--info`/`--success`/`--warning`/`--destructive` instead means
 * the palette resolves through the kit's own light/dark values
 * automatically, the same way every other token-driven color in this app
 * does.
 */

import type { ChartConfig } from '@gears-frontx/ui-kit';

export const DASHBOARD_PALETTE = {
  violet: 'var(--primary)',
  blue: 'var(--info)',
  green: 'var(--success)',
  amber: 'var(--warning)',
  rose: 'var(--destructive)',
} as const;

/** Row 1's four KPI charts - one hue AND one chart type per card (area, bar,
 * line), the C-reference convention this screen borrows (see the dashboard
 * spec). */
export const openConversationsChartConfig: ChartConfig = {
  value: { label: 'Open conversations', color: DASHBOARD_PALETTE.violet },
};

export const resolvedThisWeekChartConfig: ChartConfig = {
  value: { label: 'Resolved', color: DASHBOARD_PALETTE.green },
};

export const avgFirstResponseChartConfig: ChartConfig = {
  value: { label: 'Avg first response', color: DASHBOARD_PALETTE.blue },
};

/** Row 1's fourth card, "Contacts by stage" - a five-segment donut, one hue
 * per lifecycle stage. Reuses the same five palette hues every other chart
 * on this screen draws from, so "violet" still reads the same everywhere. */
export const contactsByStageChartConfig: ChartConfig = {
  prospect: { label: 'Prospect', color: DASHBOARD_PALETTE.blue },
  engaged: { label: 'Engaged', color: DASHBOARD_PALETTE.green },
  customer: { label: 'Customer', color: DASHBOARD_PALETTE.amber },
  'at-risk': { label: 'At risk', color: DASHBOARD_PALETTE.violet },
  churned: { label: 'Churned', color: DASHBOARD_PALETTE.rose },
};

/** Row 2's large "Resolved per day" chart: every bar neutral except today's,
 * which carries the brand accent - the reference's own highlight pattern. */
export const resolvedPerDayChartConfig: ChartConfig = {
  value: { label: 'Resolved', color: 'var(--muted-foreground)' },
  today: { label: 'Today', color: 'var(--primary)' },
};

/** Row 2's "New contacts" hero: bars for the inbound volume, a line for the
 * combined total riding over them. */
export const newContactsChartConfig: ChartConfig = {
  inbound: { label: 'Inbound', color: DASHBOARD_PALETTE.blue },
  total: { label: 'Total', color: DASHBOARD_PALETTE.violet },
};

/** The Summary card's small gradient-filled trend area. */
export const summaryTrendChartConfig: ChartConfig = {
  value: { label: 'Activity', color: DASHBOARD_PALETTE.amber },
};

/** Row 3's "Records created" line chart - one hue per record type, drawn
 * from the same palette every other chart on this screen uses. */
export const recordsCreatedChartConfig: ChartConfig = {
  companies: { label: 'Companies', color: DASHBOARD_PALETTE.blue },
  opportunities: { label: 'Opportunities', color: DASHBOARD_PALETTE.amber },
  people: { label: 'People', color: DASHBOARD_PALETTE.green },
};
