import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@gears-frontx/ui-kit';
import type { ConversionSource } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { conversionChartConfig } from './dashboardChartConfig';
import { conversionWonPercent } from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type ConversionBySourceCardProps = {
  sources: ConversionSource[];
  t: Translate;
};

const CHART_DIMENSION = { width: 560, height: 220 };
const CHART_MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };

/**
 * The new row's right card, roughly twice the funnel's width: one
 * horizontal stacked bar per lead source, split Won/Lost - the reference's
 * own pattern (see the dashboard spec). The headline percent is every
 * source's won share of its own won-plus-lost total, computed in
 * `conversionWonPercent` rather than stored.
 */
export function ConversionBySourceCard({ sources, t }: ConversionBySourceCardProps) {
  const wonPercent = conversionWonPercent(sources);

  return (
    <Card className={styles.conversionCard}>
      <CardHeader>
        <CardTitle>{t('conversion_by_source')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.conversionContent}>
        <div className={styles.recordsCreatedHeadline}>
          <span className={styles.heroValue}>{wonPercent}%</span>
        </div>
        <p className={styles.recordsCreatedSubtitle}>{t('conversion_by_source_subtitle')}</p>
        <ChartContainer
          config={conversionChartConfig}
          className={styles.conversionChart}
          initialDimension={CHART_DIMENSION}
        >
          <BarChart data={sources} layout="vertical" margin={CHART_MARGIN}>
            <CartesianGrid horizontal={false} vertical strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
              width={72}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="won" stackId="conversion" fill="var(--color-won)" radius={[4, 0, 0, 4]} />
            <Bar dataKey="lost" stackId="conversion" fill="var(--color-lost)" radius={[0, 4, 4, 0]} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
