import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@gears-frontx/ui-kit';

/**
 * The "Team utilization" KPI card's inline chart - the one card in row 1
 * whose chart type is neither area, bar nor line, per the reference's
 * "varied and alive, not four identical widgets" pattern (see the dashboard
 * spec). A single-value radial gauge with its own percentage centered
 * inside a thick ring, built the same way the kit's `chart` doc's own
 * radial example is: `RadialBarChart` plus a `Label` whose `content` reads
 * the polar viewBox Recharts hands it back.
 *
 * Sized to be the hero of its card, not a shrunken decoration next to the
 * other three cards' sparklines - a small ring with a small number read as
 * an afterthought; this one is deliberately the largest single chart in row
 * 1.
 */
export type RadialGaugeProps = {
  /** 0-100. */
  value: number;
  config: ChartConfig;
  className?: string;
};

const GAUGE_DIMENSION = { width: 140, height: 140 };

export function RadialGauge({ value, config, className }: RadialGaugeProps) {
  const data = [{ metric: 'value', value }];

  return (
    <ChartContainer config={config} className={className} initialDimension={GAUGE_DIMENSION}>
      <RadialBarChart
        data={data}
        startAngle={90}
        endAngle={90 - (360 * value) / 100}
        innerRadius="72%"
        outerRadius="100%"
        barSize={16}
      >
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false} domain={[0, 100]}>
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !('cx' in viewBox) || viewBox.cx == null || viewBox.cy == null) {
                return null;
              }
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan
                    x={viewBox.cx}
                    y={viewBox.cy - 6}
                    fill="var(--foreground)"
                    style={{ fontSize: '1.5rem', fontWeight: 700 }}
                  >
                    {value}%
                  </tspan>
                  <tspan
                    x={viewBox.cx}
                    y={viewBox.cy + 16}
                    fill="var(--muted-foreground)"
                    style={{ fontSize: '0.6875rem', fontWeight: 500 }}
                  >
                    utilized
                  </tspan>
                </text>
              );
            }}
          />
        </PolarRadiusAxis>
        <RadialBar dataKey="value" background cornerRadius={8} fill="var(--color-value)" />
      </RadialBarChart>
    </ChartContainer>
  );
}
