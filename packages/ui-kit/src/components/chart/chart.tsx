'use client';

// @cpt-FEATURE:chart:p1
/*
 * Upstream (apps/v4/registry/bases/base/ui/chart.tsx) wraps Recharts:
 * ChartContainer supplies the ResponsiveContainer plus a per-instance
 * runtime `<style>` tag (ChartStyle) that turns each `ChartConfig` entry
 * into a `--color-<key>` custom property scoped to that one chart instance
 * via a `data-chart` id — the hook a consumer's own Bar/Line/Area elements
 * read from (`fill="var(--color-desktop)"`) to pick up branded series
 * colors without prop-drilling them through Recharts' own API. `data-chart`
 * is that scoping id, not this kit's usual `data-slot` marker — there is no
 * `data-slot` here by design, same as every other ported part.
 *
 * Three deliberate deviations from upstream, all forced by this kit's own
 * constraints rather than a style preference — see chart.md's "Porting
 * notes" for the consumer-facing summary:
 *
 * 1. THEMES / dark selector — upstream keys the per-theme color map by
 *    `{ light: "", dark: ".dark" }`, a literal Tailwind dark-mode class
 *    selector. This kit has no such class (see theme.css's header): dark
 *    mode is `[data-theme='dark']` plus a `prefers-color-scheme` fallback
 *    guarded by `:not([data-theme='light'])`. ChartStyle below emits BOTH
 *    selectors for the dark entry instead of one, mirroring theme.css's own
 *    dual mechanism. The public `ChartConfig['theme']` keys stay exactly
 *    `light`/`dark` regardless — that part is upstream's real API, not the
 *    selector text it happens to compile to.
 * 2. No `--chart-1`..`--chart-5` palette — those tokens don't exist in
 *    theme.css (frozen for this port) and were deliberately not added.
 *    A consumer supplies every series color through `ChartConfig` itself
 *    (`color` or `theme`) — upstream's real, load-bearing API regardless;
 *    shadcn's own docs setting `--chart-1` etc. is just ONE value for that
 *    same `color` field, not a requirement of the mechanism.
 * 3. Five of upstream's twelve `[&_.recharts-*]` descendant rules target an
 *    attribute VALUE Recharts hardcodes on its own default-rendered
 *    elements (`[stroke='#ccc']`, `[stroke='#fff']`) to retint or
 *    neutralize them. Expressing that selector needs the literal hex in
 *    chart.module.css, which tokens.test.ts's raw-color guard forbids
 *    outright — it scans the whole stylesheet text, not just declarations
 *    — and that test is frozen for this port. Those five rules are
 *    omitted; the other seven (axis-tick text, tooltip-cursor stroke,
 *    layer/sector/surface outline reset, radial-bar/tooltip-cursor fill)
 *    carry no hex literal and are ported as-is. Net effect: Recharts' own
 *    default gray grid/reference lines and white dot/sector strokes keep
 *    the library's stock color instead of picking up `--border`/
 *    transparent — cosmetic only, and only visible on a chart that leaves
 *    Recharts to draw its own default stroke.
 */

import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  createContext,
  useContext,
  useId,
  useMemo,
} from 'react';
import { cx } from 'class-variance-authority';
import * as RechartsPrimitive from 'recharts';
import type { DefaultLegendContentProps, DefaultTooltipContentProps, TooltipValueType } from 'recharts';

import styles from './chart.module.css';

// Matches Recharts' own default (used when a chart mounts with no measured
// size yet) being {-1,-1} — upstream overrides it to a real, positive size
// so ChartContainer's children render immediately instead of waiting for a
// ResizeObserver entry that jsdom (and a slow first paint) may delay.
const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

type TooltipNameType = number | string;

export type ChartConfig = Record<
  string,
  {
    label?: ReactNode;
    icon?: ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<'light' | 'dark', string> }
  )
>;

interface ChartContextValue {
  config: ChartConfig;
}

const ChartContext = createContext<ChartContextValue | null>(null);

function useChart() {
  const context = useContext(ChartContext);

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }

  return context;
}

export type ChartContainerProps = Omit<ComponentProps<'div'>, 'className' | 'children'> & {
  className?: string;
  config: ChartConfig;
  children: ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
  initialDimension?: { width: number; height: number };
};

export function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: ChartContainerProps) {
  const uniqueId = useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div data-chart={chartId} className={cx(styles.container, className)} {...props}>
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export interface ChartStyleProps {
  id: string;
  config: ChartConfig;
}

// Exported standalone (matching upstream) for a consumer building their own
// chart shell without ChartContainer's div/ResponsiveContainer wrapper, who
// still wants the same per-instance `--color-*` custom-property injection.
export function ChartStyle({ id, config }: ChartStyleProps) {
  const colorConfig = Object.entries(config).filter(([, itemConfig]) => itemConfig.theme ?? itemConfig.color);

  if (!colorConfig.length) {
    return null;
  }

  const declarationsFor = (theme: 'light' | 'dark') =>
    colorConfig
      .map(([key, itemConfig]) => {
        const color = itemConfig.theme?.[theme] ?? itemConfig.color;
        return color ? `  --color-${key}: ${color};` : null;
      })
      .filter((declaration): declaration is string => declaration !== null)
      .join('\n');

  const lightDeclarations = declarationsFor('light');
  const darkDeclarations = declarationsFor('dark');

  // See the file header's point 1: two dark blocks (an explicit attribute
  // selector plus a prefers-color-scheme fallback) instead of upstream's
  // single `.dark` class, mirroring theme.css's own dual mechanism. The
  // light block carries no selector prefix, same as upstream's `THEMES.light
  // === ""` — it is the unconditional default every chart instance starts
  // from, which the dark blocks below layer on top of.
  const css = `
[data-chart=${id}] {
${lightDeclarations}
}

[data-theme='dark'] [data-chart=${id}] {
${darkDeclarations}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) [data-chart=${id}] {
${darkDeclarations}
  }
}
`;

  // Per-instance, consumer-supplied colors have no other way to reach a
  // scoped CSS custom property — there is no static class this kit's build
  // could hash for an arbitrary runtime string. Same trade-off upstream
  // makes with its own dangerouslySetInnerHTML.
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

export type ChartTooltipContentProps = ComponentProps<typeof RechartsPrimitive.Tooltip> &
  Omit<ComponentProps<'div'>, 'className'> & {
    className?: string;
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: 'line' | 'dot' | 'dashed';
    nameKey?: string;
    labelKey?: string;
  } & Omit<DefaultTooltipContentProps<TooltipValueType, TooltipNameType>, 'accessibilityLayer'>;

export function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  const tooltipLabel = useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? 'value'}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === 'string' ? (config[label]?.label ?? label) : itemConfig?.label;

    if (labelFormatter) {
      return <div className={cx(styles.tooltipLabel, labelClassName)}>{labelFormatter(value, payload)}</div>;
    }

    if (!value) {
      return null;
    }

    return <div className={cx(styles.tooltipLabel, labelClassName)}>{value}</div>;
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

  if (!active || !payload?.length) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== 'dot';

  return (
    <div className={cx(styles.tooltipContent, className)}>
      {!nestLabel ? tooltipLabel : null}
      <div className={styles.tooltipItems}>
        {payload
          .filter((item) => item.type !== 'none')
          .map((item, index) => {
            const key = `${nameKey ?? item.name ?? item.dataKey ?? 'value'}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor = color ?? item.payload?.fill ?? item.color;

            return (
              <div
                key={index}
                className={cx(styles.tooltipItem, indicator === 'dot' && styles.tooltipItemCentered)}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cx(
                            styles.indicator,
                            indicator === 'dot' && styles.indicatorDot,
                            indicator === 'line' && styles.indicatorLine,
                            indicator === 'dashed' && styles.indicatorDashed,
                            indicator === 'dashed' && nestLabel && styles.indicatorNested,
                          )}
                          // Two paint targets, not one custom-property pair like
                          // upstream's Tailwind `bg-(--color-bg)`/`border-(--color-border)`
                          // arbitrary-value classes: dot/line indicators are filled
                          // swatches (background only — chart.module.css's `.indicator`
                          // sets no border), the dashed indicator is a hollow
                          // dashed-border swatch (border only — `.indicatorDashed`
                          // keeps its own background transparent). Setting both
                          // properties unconditionally, like upstream does via two
                          // always-present custom properties, would depend on which
                          // Tailwind utility wins the cascade for the dashed case;
                          // branching here is unambiguous.
                          style={
                            indicator === 'dashed'
                              ? { borderColor: indicatorColor }
                              : { backgroundColor: indicatorColor }
                          }
                        />
                      )
                    )}
                    <div
                      className={cx(
                        styles.tooltipItemBody,
                        nestLabel ? styles.tooltipItemBodyNested : styles.tooltipItemBodyInline,
                      )}
                    >
                      <div className={styles.tooltipItemLabelGroup}>
                        {nestLabel ? tooltipLabel : null}
                        <span className={styles.tooltipItemName}>{itemConfig?.label ?? item.name}</span>
                      </div>
                      {item.value != null && (
                        <span className={styles.tooltipItemValue}>
                          {typeof item.value === 'number' ? item.value.toLocaleString() : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export const ChartLegend = RechartsPrimitive.Legend;

export type ChartLegendContentProps = Omit<ComponentProps<'div'>, 'className'> & {
  className?: string;
  hideIcon?: boolean;
  nameKey?: string;
} & DefaultLegendContentProps;

export function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = 'bottom',
  nameKey,
}: ChartLegendContentProps) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cx(
        styles.legendContent,
        verticalAlign === 'top' ? styles.legendTop : styles.legendBottom,
        className,
      )}
    >
      {payload
        .filter((item) => item.type !== 'none')
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? 'value'}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div key={index} className={styles.legendItem}>
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div className={styles.legendSwatch} style={{ backgroundColor: item.color }} />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
}

// Guarded, single-purpose replacement for upstream's two inline
// `payload[key as keyof typeof payload] as string` assertions: `in` proves
// the property exists at runtime, this narrows the read value itself
// instead of asserting the container's shape.
function getStringField(source: object, key: string): string | undefined {
  if (!(key in source)) {
    return undefined;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
): ChartConfig[string] | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const payloadPayload =
    'payload' in payload && typeof payload.payload === 'object' && payload.payload !== null
      ? payload.payload
      : undefined;

  const configLabelKey =
    getStringField(payload, key) ?? (payloadPayload && getStringField(payloadPayload, key)) ?? key;

  return configLabelKey in config ? config[configLabelKey] : config[key];
}
