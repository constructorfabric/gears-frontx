import { useId } from 'react';
import { CircleAlertIcon, ClockIcon, MessageSquareIcon } from 'lucide-react';
import { Area, AreaChart } from 'recharts';
import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, ChartContainer } from '@gears-frontx/ui-kit';
import type { ActivityItem } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { labelOf } from '../../shared/format';
import { summaryTrendChartConfig } from './dashboardChartConfig';
import { formatCount } from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type SummaryCardProps = {
  activity: ActivityItem[];
  trend: number[];
  t: Translate;
};

const CHART_DIMENSION = { width: 200, height: 48 };
const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: 4 };

/**
 * Row 2's third block: three icon-stat cells counted straight from the same
 * activity collection row 4's table renders (never a separately-stored
 * total), a small gradient-filled trend area, and one CTA button that stays
 * inert - this
 * template ships no report screen behind it, so it stays disabled rather
 * than silently doing nothing (same reasoning as the rail's profile menu
 * items).
 */
export function SummaryCard({ activity, trend, t }: SummaryCardProps) {
  const gradientId = `dashboard-summary-fill-${useId()}`;
  const openCount = activity.filter((item) => item.status === 'open').length;
  const pendingCount = activity.filter((item) => item.status === 'pending').length;
  const escalatedCount = activity.filter((item) => item.status === 'escalated').length;

  const trendData = trend.map((value, index) => ({ index, value }));

  return (
    <Card className={styles.summaryCard}>
      <CardHeader>
        <CardTitle>{t('summary')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.summaryContent}>
        <div className={styles.summaryStats}>
          <div className={styles.summaryStat}>
            <span className={styles.summaryIconChip}>
              <MessageSquareIcon />
            </span>
            <span className={styles.summaryStatValue}>{formatCount(openCount)}</span>
            <span className={styles.summaryStatLabel}>{labelOf('open')}</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryIconChip}>
              <ClockIcon />
            </span>
            <span className={styles.summaryStatValue}>{formatCount(pendingCount)}</span>
            <span className={styles.summaryStatLabel}>{labelOf('pending')}</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryIconChip}>
              <CircleAlertIcon />
            </span>
            <span className={styles.summaryStatValue}>{formatCount(escalatedCount)}</span>
            <span className={styles.summaryStatLabel}>{labelOf('escalated')}</span>
          </div>
        </div>
        <ChartContainer
          config={summaryTrendChartConfig}
          className={styles.summaryChart}
          initialDimension={CHART_DIMENSION}
        >
          <AreaChart data={trendData} margin={CHART_MARGIN}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <Button variant="outline" disabled className={styles.summaryCta}>
          {t('view_report')}
        </Button>
      </CardFooter>
    </Card>
  );
}
