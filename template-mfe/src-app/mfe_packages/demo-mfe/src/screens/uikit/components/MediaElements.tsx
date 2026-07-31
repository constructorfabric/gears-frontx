/**
 * Media Elements Category
 *
 * Demonstrates: Image, Chart, Calendar
 */

import React, { useState } from 'react';
import { Separator } from '../../../components/ui/separator';
import { Calendar } from '../../../components/ui/calendar';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  ResponsiveContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../components/ui/chart';

interface MediaElementsProps {
  t: (key: string) => string;
}

const ElementDemo: React.FC<{ id: string; title: string; description: string; children: React.ReactNode }> = ({
  id,
  title,
  description,
  children,
}) => (
  <div id={id} className="scroll-mt-4 mb-8">
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground mb-4">{description}</p>
    <div className="border border-border rounded-lg p-6 bg-background">{children}</div>
  </div>
);

const chartData = [
  { month: 'Jan', value: 186 },
  { month: 'Feb', value: 305 },
  { month: 'Mar', value: 237 },
  { month: 'Apr', value: 273 },
  { month: 'May', value: 209 },
  { month: 'Jun', value: 314 },
];

export const MediaElements: React.FC<MediaElementsProps> = ({ t }) => {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div id="category-media" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.media')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* Image */}
      <ElementDemo
        id="element-image"
        title={t('element.image.title')}
        description={t('element.image.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export a dedicated Image component.</p>
          <p className="mt-2">Use standard HTML &lt;img&gt; or Next.js Image for images:</p>
          <div className="mt-4">
            <img
              src="https://via.placeholder.com/300x200"
              alt="Placeholder"
              className="rounded-lg border border-border"
            />
          </div>
        </div>
      </ElementDemo>

      {/* Chart */}
      <ElementDemo
        id="element-chart"
        title={t('element.chart.title')}
        description={t('element.chart.description')}
      >
        <div className="space-y-8">
          <div>
            <h4 className="text-sm font-semibold mb-4">Bar Chart</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-4">Line Chart</h4>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </ElementDemo>

      {/* Calendar */}
      <ElementDemo
        id="element-calendar"
        title={t('element.calendar.title')}
        description={t('element.calendar.description')}
      >
        <div className="flex justify-center">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border"
          />
        </div>
        {date && (
          <p className="mt-4 text-sm text-muted-foreground text-center">
            Selected: {date.toLocaleDateString()}
          </p>
        )}
      </ElementDemo>
    </div>
  );
};

MediaElements.displayName = 'MediaElements';
