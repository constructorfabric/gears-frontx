import { Badge, Card, CardContent, CardFooter, type ChartConfig } from '@gears-frontx/ui-kit';
import type { DashboardKpiCard } from '../../api/dashboardTypes';
import {
  avgFirstResponseChartConfig,
  openConversationsChartConfig,
  resolvedThisWeekChartConfig,
  teamUtilizationChartConfig,
} from './dashboardChartConfig';
import {
  deltaTone,
  formatDeltaPercent,
  formatKpiFooterValue,
  formatKpiValue,
  kpiDeltaPercent,
  kpiValue,
} from './dashboardSelectors';
import { RadialGauge } from './RadialGauge';
import { AreaSparkline, BarSparkline, LineSparkline } from './Sparkline';
import styles from '../../styles/dashboard.module.css';

const CHART_CONFIG_BY_ID: Record<string, ChartConfig> = {
  'open-conversations': openConversationsChartConfig,
  'resolved-this-week': resolvedThisWeekChartConfig,
  'avg-first-response': avgFirstResponseChartConfig,
  'team-utilization': teamUtilizationChartConfig,
};

export type KpiCardProps = {
  kpi: DashboardKpiCard;
};

/**
 * Row 1's own card shape: a big number, a delta badge toned by whether the
 * move is good news for this particular metric, a label, a small inline
 * chart whose type varies card to card, and a footer stat. See the dashboard
 * spec's "varied and alive, not four identical widgets" note - the chart
 * type switch below is that variety, not an accident of four separate
 * components.
 */
export function KpiCard({ kpi }: KpiCardProps) {
  const value = kpiValue(kpi);
  const delta = kpiDeltaPercent(kpi);
  const tone = deltaTone(delta, kpi.goodWhenPositive);
  const config = CHART_CONFIG_BY_ID[kpi.id] ?? openConversationsChartConfig;

  return (
    <Card>
      <CardContent className={styles.kpiCardContent}>
        <div className={styles.kpiCardTop}>
          <div className={styles.kpiHeadline}>
            <span className={styles.kpiValue}>{formatKpiValue(kpi, value)}</span>
            <Badge variant={tone}>{formatDeltaPercent(delta)}</Badge>
          </div>
          <span className={styles.kpiLabel}>{kpi.label}</span>
        </div>
        <div className={kpi.chartType === 'radial' ? styles.kpiChartRadial : styles.kpiChart}>
          {kpi.chartType === 'area' && (
            <AreaSparkline data={kpi.series} config={config} className={styles.sparkline} />
          )}
          {kpi.chartType === 'bar' && (
            <BarSparkline data={kpi.series} config={config} className={styles.sparkline} />
          )}
          {kpi.chartType === 'line' && (
            <LineSparkline data={kpi.series} config={config} className={styles.sparkline} />
          )}
          {kpi.chartType === 'radial' && (
            <RadialGauge value={value} config={config} className={styles.radialGauge} />
          )}
        </div>
      </CardContent>
      <CardFooter className={styles.kpiCardFooter}>
        <span className={styles.kpiFooterLabel}>{kpi.footerLabel}</span>
        <span className={styles.kpiFooterValue}>{formatKpiFooterValue(kpi)}</span>
      </CardFooter>
    </Card>
  );
}
