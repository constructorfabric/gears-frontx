import { describe, expect, it } from 'vitest';
import type { DashboardKpiCard } from '../../api/dashboardTypes';
import {
  deltaTone,
  formatDeltaPercent,
  formatKpiValue,
  kpiDeltaPercent,
  kpiValue,
  newContactsDeltaPercent,
  newContactsInboundTotal,
  newContactsOutboundTotal,
  newContactsTotal,
  recordsCreatedTotal,
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

describe('workloadPercent', () => {
  it('computes a fill percentage from value over max', () => {
    expect(workloadPercent({ id: 'w', label: 'W', value: 34, max: 50 })).toBe(68);
  });

  it('never divides by zero', () => {
    expect(workloadPercent({ id: 'w', label: 'W', value: 0, max: 0 })).toBe(0);
  });
});
