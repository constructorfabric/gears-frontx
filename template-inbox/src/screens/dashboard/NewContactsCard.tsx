import { Bar, ComposedChart, Line, XAxis } from 'recharts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@gears-frontx/ui-kit';
import type { NewContactsSeries } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { newContactsChartConfig } from './dashboardChartConfig';
import {
  deltaTone,
  formatCount,
  formatDeltaPercent,
  newContactsDeltaPercent,
  newContactsInboundTotal,
  newContactsOutboundTotal,
  newContactsTotal,
} from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type NewContactsCardProps = {
  newContacts: NewContactsSeries;
  t: Translate;
};

const CHART_DIMENSION = { width: 320, height: 140 };
const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: 4 };

/**
 * Row 2's compound hero card: a big number, a delta badge, an Inbound/
 * Outbound breakdown, and a combo chart - a subtle, low-opacity bar for the
 * inbound volume with a bold line for the combined daily total riding over
 * it, so the line reads as the hero and the bars as its context, matching
 * the reference's "Pipeline created" pattern (see the dashboard spec).
 */
export function NewContactsCard({ newContacts, t }: NewContactsCardProps) {
  const total = newContactsTotal(newContacts.series);
  const delta = newContactsDeltaPercent(newContacts);
  const tone = deltaTone(delta, true);
  const inboundTotal = newContactsInboundTotal(newContacts);
  const outboundTotal = newContactsOutboundTotal(newContacts);

  const chartData = newContacts.series.map((point) => ({
    day: point.day,
    inbound: point.inbound,
    total: point.inbound + point.outbound,
  }));

  return (
    <Card className={styles.newContactsCard}>
      <CardHeader>
        <CardTitle>{t('new_contacts')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.newContactsContent}>
        <div className={styles.heroHeadline}>
          <span className={styles.heroValue}>{formatCount(total)}</span>
          <Badge variant={tone}>{formatDeltaPercent(delta)}</Badge>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.heroStatRow}>
            <span className={styles.heroStatLabel}>{t('inbound')}</span>
            <span className={styles.heroStatValue}>{formatCount(inboundTotal)}</span>
          </div>
          <div className={styles.heroStatRow}>
            <span className={styles.heroStatLabel}>{t('outbound')}</span>
            <span className={styles.heroStatValue}>{formatCount(outboundTotal)}</span>
          </div>
        </div>
        <ChartContainer
          config={newContactsChartConfig}
          className={styles.heroChart}
          initialDimension={CHART_DIMENSION}
        >
          <ComposedChart data={chartData} margin={CHART_MARGIN}>
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              fontSize={11}
              stroke="var(--muted-foreground)"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="inbound"
              fill="var(--color-inbound)"
              fillOpacity={0.35}
              radius={[4, 4, 0, 0]}
              barSize={16}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="var(--color-total)"
              strokeWidth={2.5}
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
