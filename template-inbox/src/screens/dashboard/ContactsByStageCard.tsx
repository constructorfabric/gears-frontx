import { Cell, Pie, PieChart } from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@gears-frontx/ui-kit';
import type { ContactStageSegment } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { contactsByStageChartConfig } from './dashboardChartConfig';
import { contactsByStagePercent, formatCount } from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type ContactsByStageCardProps = {
  segments: ContactStageSegment[];
  t: Translate;
};

const DONUT_DIMENSION = { width: 160, height: 160 };

/**
 * Row 1's fourth card, replacing the old "Team utilization" radial gauge: a
 * thick-ring donut of contact lifecycle stages plus a template-level legend
 * list under it (dot, label, count, percent) - the reference's own
 * "segmented donut with a count+percent legend" pattern (see the dashboard
 * spec). The kit's `ChartLegendContent` only renders a swatch-plus-label
 * row, not the count/percent columns the reference wants, so the legend
 * here is plain markup fed from the same `segments` data instead.
 */
export function ContactsByStageCard({ segments, t }: ContactsByStageCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('contacts_by_stage')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.stageCardContent}>
        <ChartContainer
          config={contactsByStageChartConfig}
          className={styles.stageDonut}
          initialDimension={DONUT_DIMENSION}
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="id" />} />
            <Pie
              data={segments}
              dataKey="count"
              nameKey="id"
              innerRadius="65%"
              outerRadius="100%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {segments.map((segment) => (
                <Cell key={segment.id} fill={`var(--color-${segment.id})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className={styles.stageLegend}>
          {segments.map((segment) => (
            <li className={styles.stageLegendRow} key={segment.id}>
              <span
                className={styles.stageLegendDot}
                style={{ background: `var(--color-${segment.id})` }}
                aria-hidden="true"
              />
              <span className={styles.stageLegendLabel}>{segment.label}</span>
              <span className={styles.stageLegendCount}>{formatCount(segment.count)}</span>
              <span className={styles.stageLegendPercent}>
                {contactsByStagePercent(segment, segments)}%
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
