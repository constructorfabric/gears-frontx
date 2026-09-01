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
import type { ResolvedPerDayPoint } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { resolvedPerDayChartConfig } from './dashboardChartConfig';
import styles from '../../styles/dashboard.module.css';

export type ResolvedPerDayCardProps = {
  data: ResolvedPerDayPoint[];
  t: Translate;
};

const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const CHART_DIMENSION = { width: 420, height: 220 };

/**
 * Row 2's large stacked bar chart: each day's resolutions split by source -
 * Chat, Mail, Tasks - stacked into one bar, the owner's own "составные
 * барчарты будут лучше смотреться" call. Replaces the old single-accent
 * "today highlight" bar with the source breakdown itself, since the two
 * treatments fight each other visually; a `ChartTooltipContent` still shows
 * every segment's value on hover, and the legend spells the three sources
 * out (see the dashboard spec).
 */
export function ResolvedPerDayCard({ data, t }: ResolvedPerDayCardProps) {
  return (
    <Card className={styles.resolvedCard}>
      <CardHeader>
        <CardTitle>{t('resolved_per_day')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={resolvedPerDayChartConfig}
          className={styles.resolvedChart}
          initialDimension={CHART_DIMENSION}
        >
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
              width={24}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="chat" stackId="resolved" fill="var(--color-chat)" />
            <Bar dataKey="mail" stackId="resolved" fill="var(--color-mail)" />
            <Bar dataKey="tasks" stackId="resolved" fill="var(--color-tasks)" radius={[4, 4, 0, 0]} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
