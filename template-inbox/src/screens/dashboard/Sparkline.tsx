import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, Line, LineChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@gears-frontx/ui-kit';

/**
 * The row 1 KPI cards' inline trend charts: the kit's `chart` component with
 * every axis, grid line and legend hidden, which is the whole recipe a
 * sparkline needs on top of it (see the `chart` component's own doc - it
 * draws no chart type itself, only the Recharts primitives a consumer
 * composes). Three distinct presentations - area, bar, line - so the row
 * reads as four different instruments, not one chart type repeated with a
 * different color (the reference's own "varied and alive" note).
 */
export type SparklineProps = {
  /** Oldest to newest. */
  data: number[];
  config: ChartConfig;
  className?: string;
};

const toPoints = (data: number[]) => data.map((value, index) => ({ index, value }));

/** Big enough to read as a real chart rather than a shrunken decoration -
 * the whole point of this rework (see the dashboard spec / owner feedback). */
const SPARKLINE_DIMENSION = { width: 220, height: 120 };
const SPARKLINE_MARGIN = { top: 6, right: 4, bottom: 0, left: 4 };

export function AreaSparkline({ data, config, className }: SparklineProps) {
  // A React-unique id, not a fixed string: an SVG gradient's id is a
  // document-global reference, and two area charts on the same page with the
  // same literal id would silently share one gradient definition.
  const gradientId = `dashboard-area-fill-${useId()}`;

  return (
    <ChartContainer
      config={config}
      className={className}
      initialDimension={SPARKLINE_DIMENSION}
    >
      <AreaChart data={toPoints(data)} margin={SPARKLINE_MARGIN}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export function BarSparkline({ data, config, className }: SparklineProps) {
  return (
    <ChartContainer
      config={config}
      className={className}
      initialDimension={SPARKLINE_DIMENSION}
    >
      <BarChart data={toPoints(data)} margin={SPARKLINE_MARGIN} barCategoryGap="28%">
        <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 2, 2]} />
      </BarChart>
    </ChartContainer>
  );
}

export function LineSparkline({ data, config, className }: SparklineProps) {
  return (
    <ChartContainer
      config={config}
      className={className}
      initialDimension={SPARKLINE_DIMENSION}
    >
      <LineChart data={toPoints(data)} margin={SPARKLINE_MARGIN}>
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
