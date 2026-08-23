import { Bar, BarChart, Cell, LabelList, XAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, ChartContainer } from '@gears-frontx/ui-kit';
import type { ResolvedPerDayPoint } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { resolvedPerDayChartConfig } from './dashboardChartConfig';
import styles from '../../styles/dashboard.module.css';

export type ResolvedPerDayCardProps = {
  data: ResolvedPerDayPoint[];
  t: Translate;
};

const CHART_MARGIN = { top: 24, right: 8, bottom: 0, left: 8 };
const CHART_DIMENSION = { width: 420, height: 220 };
const VALUE_LABEL_STYLE = { fill: 'var(--foreground)', fontSize: 12, fontWeight: 600 };

/**
 * Row 2's large bar chart: value labels above every bar and the last point
 * (today) picked out in the brand accent against otherwise-neutral bars -
 * the reference's own "Deals closed" pattern, renamed for this screen's
 * support/CRM vocabulary (see the dashboard spec).
 */
export function ResolvedPerDayCard({ data, t }: ResolvedPerDayCardProps) {
  const todayIndex = data.length - 1;

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
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
            />
            <Bar dataKey="value" radius={6}>
              <LabelList dataKey="value" position="top" style={VALUE_LABEL_STYLE} />
              {data.map((point, index) => (
                <Cell
                  key={point.day}
                  fill={index === todayIndex ? 'var(--color-today)' : 'var(--color-value)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
