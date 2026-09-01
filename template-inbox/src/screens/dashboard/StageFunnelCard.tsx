import { Card, CardContent, CardHeader, CardTitle } from '@gears-frontx/ui-kit';
import type { FunnelStage } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { stageFunnelChartConfig } from './dashboardChartConfig';
import { formatCount, funnelSegmentGeometry, funnelTotal } from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type StageFunnelCardProps = {
  stages: FunnelStage[];
  t: Translate;
};

const FUNNEL_VIEWBOX = { width: 300, height: 200 };
const FUNNEL_SEGMENT_GAP = 3;

/**
 * The new row's left card: a true funnel - equal-height trapezoid bands
 * whose top/bottom edge widths are each stage's own share of the first
 * (widest) stage's count, thin gaps between bands, and a flat-bottomed
 * last segment that never narrows to a point - rendered as a plain SVG
 * rather than recharts' `Funnel`, whose own default always converges to a
 * point regardless of the last stage's real share. `funnelSegmentGeometry`
 * (see its own doc) carries the point math and per-label font fit; this
 * component only lays the result out. `--primary-foreground` is this kit's
 * one token meant to sit on a solid, saturated fill (paired with
 * `--primary` elsewhere, e.g. the primary Button variant); every segment
 * fill is one of this screen's own five palette hues from
 * `stageFunnelChartConfig`, so the same white reads across all of them.
 */
export function StageFunnelCard({ stages, t }: StageFunnelCardProps) {
  const total = funnelTotal(stages);
  const segments = funnelSegmentGeometry(stages, {
    width: FUNNEL_VIEWBOX.width,
    height: FUNNEL_VIEWBOX.height,
    gap: FUNNEL_SEGMENT_GAP,
  });

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
        <svg
          className={styles.funnelChart}
          viewBox={`0 0 ${FUNNEL_VIEWBOX.width} ${FUNNEL_VIEWBOX.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={t('stage_funnel')}
        >
          {segments.map((segment) => (
            <g key={segment.id}>
              <polygon points={segment.points} fill={stageFunnelChartConfig[segment.id]?.color} />
              <text
                x={segment.labelX}
                y={segment.labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={segment.fontSize}
                fontWeight={600}
                textLength={segment.textLength}
                lengthAdjust={segment.textLength === undefined ? undefined : 'spacingAndGlyphs'}
                className={styles.funnelSegmentLabel}
              >
                {segment.text}
              </text>
            </g>
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}
