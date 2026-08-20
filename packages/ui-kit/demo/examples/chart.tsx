import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@gears-frontx/ui-kit';

import { Row, Section } from '../shared';

const chartConfig = {
  desktop: { label: 'Desktop', color: 'var(--primary)' },
  mobile: { label: 'Mobile', color: 'var(--info)' },
} satisfies ChartConfig;

const themedChartConfig = {
  desktop: { label: 'Desktop', theme: { light: '#2563eb', dark: '#60a5fa' } },
  mobile: { label: 'Mobile', color: '#e11d48' },
} satisfies ChartConfig;

const data = [
  { month: 'Jan', desktop: 186, mobile: 80 },
  { month: 'Feb', desktop: 305, mobile: 200 },
  { month: 'Mar', desktop: 237, mobile: 120 },
  { month: 'Apr', desktop: 173, mobile: 190 },
  { month: 'May', desktop: 209, mobile: 130 },
];

export default function ChartExample() {
  return (
    <>
      <Section title="Bar chart">
        <ChartContainer config={chartConfig} style={{ maxWidth: 480 }}>
          <BarChart data={data}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
            <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </Section>
      <Section title="Tooltip indicators">
        <Row>
          {(['dot', 'line', 'dashed'] as const).map((indicator) => (
            <ChartContainer key={indicator} config={chartConfig} style={{ maxWidth: 260 }}>
              <BarChart data={data}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent indicator={indicator} />} />
                <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
                <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
              </BarChart>
            </ChartContainer>
          ))}
        </Row>
      </Section>
      <Section title="Legend position">
        <ChartContainer config={chartConfig} style={{ maxWidth: 480 }}>
          <BarChart data={data}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartLegend content={<ChartLegendContent verticalAlign="top" />} verticalAlign="top" />
            <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
            <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
          </BarChart>
        </ChartContainer>
      </Section>
      <Section title="Colors">
        <ChartContainer config={themedChartConfig} style={{ maxWidth: 480 }}>
          <BarChart data={data}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
            <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </Section>
    </>
  );
}
