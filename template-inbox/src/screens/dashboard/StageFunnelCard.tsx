import { Cell, Funnel, FunnelChart, LabelList } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, ChartContainer } from '@gears-frontx/ui-kit';
import type { FunnelStage } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { stageFunnelChartConfig } from './dashboardChartConfig';
import { formatCount, funnelStagePercent, funnelTotal } from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type StageFunnelCardProps = {
  stages: FunnelStage[];
  t: Translate;
};

const FUNNEL_DIMENSION = { width: 280, height: 220 };
const FUNNEL_LABEL_STYLE = { fill: 'var(--primary-foreground)', fontSize: 12, fontWeight: 600 };

/**
 * The new row's left card: a symmetric funnel narrowing stage by stage,
 * each segment centered with its own "Stage · NN%" label - the reference's
 * own pattern (see the dashboard spec). `--primary-foreground` is this
 * kit's one token meant to sit on a solid, saturated fill (paired with
 * `--primary` elsewhere, e.g. the primary Button variant); every segment
 * fill is one of this screen's own five palette hues, so the same white
 * reads across all of them.
 */
export function StageFunnelCard({ stages, t }: StageFunnelCardProps) {
  const total = funnelTotal(stages);
  const data = stages.map((stage) => ({
    ...stage,
    name: `${stage.label} · ${funnelStagePercent(stage, stages)}%`,
  }));

  return (
    <Card className={styles.funnelCard}>
      <CardHeader>
        <CardTitle>{t('stage_funnel')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.funnelContent}>
        <div className={styles.recordsCreatedHeadline}>
          <span className={styles.heroValue}>{formatCount(total)}</span>
        </div>
        <p className={styles.recordsCreatedSubtitle}>{t('stage_funnel_subtitle')}</p>
        <ChartContainer
          config={stageFunnelChartConfig}
          className={styles.funnelChart}
          initialDimension={FUNNEL_DIMENSION}
        >
          <FunnelChart>
            <Funnel data={data} dataKey="count" nameKey="id" isAnimationActive={false}>
              <LabelList dataKey="name" position="center" style={FUNNEL_LABEL_STYLE} />
              {data.map((stage) => (
                <Cell key={stage.id} fill={`var(--color-${stage.id})`} />
              ))}
            </Funnel>
          </FunnelChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
