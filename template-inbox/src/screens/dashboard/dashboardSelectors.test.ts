import { describe, expect, it } from 'vitest';
import type { DashboardKpiCard } from '../../api/dashboardTypes';
import {
  contactsByStagePercent,
  conversionWonPercent,
  deltaTone,
  formatDeltaPercent,
  formatKpiValue,
  funnelStagePercent,
  funnelTotal,
  kpiDeltaPercent,
  kpiValue,
  newContactsDeltaPercent,
  newContactsInboundTotal,
  newContactsOutboundTotal,
  newContactsTotal,
  recordsCreatedTotal,
  resolvedPerDayTotal,
  resolvedPerDayWeekTotal,
  workloadPercent,
} from './dashboardSelectors';

const baseKpi: DashboardKpiCard = {
  id: 'test',
  label: 'Test metric',
  unit: 'count',
  chartType: 'bar',
  valueMode: 'last',
  series: [10, 12, 11, 14],
  previousValue: 10,
  goodWhenPositive: true,
  footerLabel: 'Footer',
  footerValue: 1,
  footerUnit: 'count',
};

describe('kpiValue', () => {
  it('reads the latest point for a "last" card', () => {
    expect(kpiValue(baseKpi)).toBe(14);
  });

  it('sums every point for a "sum" card', () => {
    expect(kpiValue({ ...baseKpi, valueMode: 'sum' })).toBe(47);
  });
});

describe('kpiDeltaPercent', () => {
  it('computes percent change against the prior-period value', () => {
    // 14 vs 10 is +40%.
    expect(kpiDeltaPercent(baseKpi)).toBe(40);
  });

  it('treats a zero prior value as a full swing rather than dividing by zero', () => {
    expect(kpiDeltaPercent({ ...baseKpi, previousValue: 0 })).toBe(100);
    expect(kpiDeltaPercent({ ...baseKpi, previousValue: 0, series: [0, 0] })).toBe(0);
  });
});

describe('deltaTone', () => {
  it('reads a rise as success when rising is the good direction', () => {
    expect(deltaTone(12, true)).toBe('success');
    expect(deltaTone(-12, true)).toBe('danger');
  });

  it('flips the reading when falling is the good direction', () => {
    expect(deltaTone(12, false)).toBe('danger');
    expect(deltaTone(-12, false)).toBe('success');
  });

  it('reads no change as neutral regardless of direction', () => {
    expect(deltaTone(0, true)).toBe('secondary');
    expect(deltaTone(0, false)).toBe('secondary');
  });
});

describe('formatDeltaPercent', () => {
  it('signs a positive delta and leaves a negative one alone', () => {
    expect(formatDeltaPercent(12.4)).toBe('+12.4%');
    expect(formatDeltaPercent(-8.3)).toBe('-8.3%');
    expect(formatDeltaPercent(0)).toBe('0%');
  });
});

describe('formatKpiValue', () => {
  it('formats each unit distinctly', () => {
    expect(formatKpiValue({ ...baseKpi, unit: 'count' }, 1234)).toBe('1,234');
    expect(formatKpiValue({ ...baseKpi, unit: 'minutes' }, 9)).toBe('9m');
    expect(formatKpiValue({ ...baseKpi, unit: 'percent' }, 79)).toBe('79%');
  });
});

describe('new contacts totals', () => {
  const series = [
    { day: 'Mon', inbound: 10, outbound: 2 },
    { day: 'Tue', inbound: 8, outbound: 4 },
  ];

  it('sums inbound and outbound together and separately', () => {
    expect(newContactsTotal(series)).toBe(24);
    expect(newContactsInboundTotal({ series, previousTotal: 0 })).toBe(18);
    expect(newContactsOutboundTotal({ series, previousTotal: 0 })).toBe(6);
  });

  it('computes the delta against the previous period total', () => {
    expect(newContactsDeltaPercent({ series, previousTotal: 20 })).toBe(20);
  });
});

describe('recordsCreatedTotal', () => {
  it('sums companies, opportunities and people across every month', () => {
    const series = [
      { month: 'Sep', companies: 5, opportunities: 7, people: 10 },
      { month: 'Oct', companies: 3, opportunities: 10, people: 6 },
    ];

    expect(recordsCreatedTotal(series)).toBe(41);
  });

  it('sums to zero for an empty series', () => {
    expect(recordsCreatedTotal([])).toBe(0);
  });
});

describe('resolvedPerDayTotal / resolvedPerDayWeekTotal', () => {
  const week = [
    { day: 'Mon', chat: 7, mail: 5, tasks: 4 },
    { day: 'Tue', chat: 9, mail: 6, tasks: 5 },
  ];

  it('sums a single day across its three stacked sources', () => {
    expect(resolvedPerDayTotal(week[0])).toBe(16);
    expect(resolvedPerDayTotal(week[1])).toBe(20);
  });

  it('sums the whole week across every day and source', () => {
    expect(resolvedPerDayWeekTotal(week)).toBe(36);
  });
});

describe('contactsByStagePercent', () => {
  const segments = [
    { id: 'prospect', label: 'Prospect', count: 15 },
    { id: 'engaged', label: 'Engaged', count: 14 },
    { id: 'customer', label: 'Customer', count: 20 },
    { id: 'at-risk', label: 'At risk', count: 7 },
    { id: 'churned', label: 'Churned', count: 4 },
  ];

  it('computes each segment share as a rounded whole percent', () => {
    expect(contactsByStagePercent(segments[0], segments)).toBe(25);
    expect(contactsByStagePercent(segments[1], segments)).toBe(23);
    expect(contactsByStagePercent(segments[2], segments)).toBe(33);
    expect(contactsByStagePercent(segments[3], segments)).toBe(12);
    expect(contactsByStagePercent(segments[4], segments)).toBe(7);
  });

  it('sums to 100 within rounding across every segment', () => {
    const total = segments.reduce(
      (sum, segment) => sum + contactsByStagePercent(segment, segments),
      0
    );
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it('never divides by zero', () => {
    expect(contactsByStagePercent({ id: 'x', label: 'X', count: 0 }, [])).toBe(0);
  });
});

describe('funnelTotal / funnelStagePercent', () => {
  const stages = [
    { id: 'new', label: 'New', count: 120 },
    { id: 'screening', label: 'Screening', count: 104 },
    { id: 'meeting', label: 'Meeting', count: 86 },
    { id: 'proposal', label: 'Proposal', count: 65 },
    { id: 'customer', label: 'Customer', count: 46 },
  ];

  it('reads the first (widest) stage as the funnel total', () => {
    expect(funnelTotal(stages)).toBe(120);
  });

  it('computes every later stage as a percent of the first stage', () => {
    expect(funnelStagePercent(stages[0], stages)).toBe(100);
    expect(funnelStagePercent(stages[1], stages)).toBe(87);
    expect(funnelStagePercent(stages[2], stages)).toBe(72);
    expect(funnelStagePercent(stages[3], stages)).toBe(54);
    expect(funnelStagePercent(stages[4], stages)).toBe(38);
  });

  it('never divides by zero', () => {
    expect(funnelTotal([])).toBe(0);
    expect(funnelStagePercent({ id: 'x', label: 'X', count: 0 }, [])).toBe(0);
  });
});

describe('conversionWonPercent', () => {
  it('computes won leads over won-plus-lost across every source', () => {
    const sources = [
      { id: 'inbound', label: 'Inbound', won: 45, lost: 15 },
      { id: 'outbound', label: 'Outbound', won: 28, lost: 32 },
    ];

    // (45 + 28) / (45 + 15 + 28 + 32) = 73 / 120 = 60.8% -> 61%.
    expect(conversionWonPercent(sources)).toBe(61);
  });

  it('never divides by zero', () => {
    expect(conversionWonPercent([])).toBe(0);
  });
});

describe('workloadPercent', () => {
  it('computes a fill percentage from value over max', () => {
    expect(workloadPercent({ id: 'w', label: 'W', value: 34, max: 50 })).toBe(68);
  });

  it('never divides by zero', () => {
    expect(workloadPercent({ id: 'w', label: 'W', value: 0, max: 0 })).toBe(0);
  });
});
