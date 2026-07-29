"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

// Re-export all Recharts chart types
export {
  // Container
  ResponsiveContainer,

  // Chart Types
  LineChart,
  BarChart,
  AreaChart,
  PieChart,
  RadarChart,
  ScatterChart,
  ComposedChart,
  RadialBarChart,
  Treemap,
  Sankey,
  FunnelChart,

  // Chart Elements
  Line,
  Bar,
  Area,
  Pie,
  Radar,
  Scatter,
  RadialBar,
  Funnel,

  // Axes
  XAxis,
  YAxis,
  ZAxis,

  // Grid & Reference
  CartesianGrid,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
  Brush,

  // Labels
  Label,
  LabelList,

  // Shapes & Utilities
  Cell,
  Cross,
  Curve,
  Dot,
  Polygon,
  Rectangle,
  Sector,
  Customized,
  Text,

  // Error Bar
  ErrorBar,

  // Types
  type TooltipProps,
  type LegendProps,
} from "recharts"

// Export Recharts Tooltip and Legend with aliases to avoid conflicts
export { Tooltip as ChartTooltip, Legend as ChartLegend } from "recharts"

// Chart Container - wrapper component for responsive charts
interface ChartContainerProps {
  className?: string
  children: React.ReactNode
  width?: string | number
  height?: string | number
  minWidth?: string | number
  minHeight?: string | number
  maxHeight?: string | number
  debounce?: number
  aspect?: number
}

function ChartContainer({
  className,
  children,
  width = "100%",
  height = 350,
}: ChartContainerProps) {
  return (
    <div
      data-slot="chart-container"
      className={cn("w-full", className)}
      style={{ width, height: typeof height === 'number' ? `${height}px` : height }}
    >
      {children}
    </div>
  )
}

// Payload item types for tooltip and legend
interface TooltipPayloadItem {
  color?: string
  name?: string
  value?: string | number
}

interface LegendPayloadItem {
  color?: string
  value?: string
}

// Chart Tooltip Content - styled content for tooltips (to be used as custom content)
interface ChartTooltipContentProps {
  className?: string
  label?: string
  payload?: TooltipPayloadItem[]
  active?: boolean
}

function ChartTooltipContent({
  className,
  label,
  payload,
  active,
}: ChartTooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  return (
    <div
      data-slot="chart-tooltip-content"
      className={cn(
        "bg-background border-border text-foreground rounded-lg border p-2 shadow-md",
        className
      )}
    >
      {label && (
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {label}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="font-medium">{item.name}:</span>
            <span className="text-muted-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Chart Legend Content - styled content for legends (to be used as custom content)
interface ChartLegendContentProps {
  className?: string
  payload?: LegendPayloadItem[]
}

function ChartLegendContent({
  className,
  payload,
}: ChartLegendContentProps) {
  if (!payload || payload.length === 0) {
    return null
  }

  return (
    <div
      data-slot="chart-legend-content"
      className={cn("flex items-center justify-center gap-4 text-sm pt-4", className)}
    >
      {payload.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

export {
  ChartContainer,
  ChartTooltipContent,
  ChartLegendContent,
}
