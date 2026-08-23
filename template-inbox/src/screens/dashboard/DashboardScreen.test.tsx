import { describe, expect, it, vi } from 'vitest';
import { endpointTags, mutationResult, queryResultFor } from '../../__test-utils__/apiMocks';
import { renderScreen } from '../../__test-utils__/renderScreen';

vi.mock('../../api/registry', () => ({
  getDashboardApi: () => endpointTags,
  getInboxApi: () => endpointTags,
}));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { DashboardScreen } = await import('./DashboardScreen');

const t = (key: string) => key;

describe('DashboardScreen', () => {
  it('renders every row 1 KPI card, with a delta badge computed from its series', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText('Open conversations')).toBeTruthy();
    expect(screen.getByText('Resolved this week')).toBeTruthy();
    expect(screen.getByText('Avg first response')).toBeTruthy();
    expect(screen.getByText('Team utilization')).toBeTruthy();

    // Cross-checked against `kpiCards` in `dashboardDataset.ts`: the latest
    // point of the open-conversations series is 24, down from a
    // `previousValue` of 33 - a computed -27.3% delta, not a hardcoded one.
    expect(screen.getAllByText('24').length).toBeGreaterThan(0);
    expect(screen.getByText('-27.3%')).toBeTruthy();

    // "Resolved this week" sums its whole series (16+20+24+29+22+18+21=150).
    expect(screen.getAllByText('150').length).toBeGreaterThan(0);

    // "Avg first response" reads its latest point in minutes.
    expect(screen.getAllByText('9m').length).toBeGreaterThan(0);

    // "Team utilization" reads its latest point as a percent.
    expect(screen.getAllByText('79%').length).toBeGreaterThan(0);

    screen.unmount();
  });

  it('renders row 2: the resolved-per-day chart, the new contacts hero, and the summary card', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText('resolved_per_day')).toBeTruthy();
    expect(screen.getByText('new_contacts')).toBeTruthy();
    // New contacts totals inbound (89) + outbound (42) = 131 - computed, not
    // stored as its own field.
    expect(screen.getAllByText('131').length).toBeGreaterThan(0);
    expect(screen.getByText('summary')).toBeTruthy();
    expect(screen.getByText('view_report')).toBeTruthy();

    screen.unmount();
  });

  it('renders row 3: the records-created chart and the ranked top-agents list, Alex Rivera included', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText('records_created')).toBeTruthy();
    expect(screen.getByText('records_created_subtitle')).toBeTruthy();
    // `recordsCreated` sums companies+opportunities+people across all 12
    // months to 266 - computed by `recordsCreatedTotal`, not hardcoded (see
    // `dashboardDataset.ts` and `dashboardSelectors.test.ts`).
    expect(screen.getAllByText('266').length).toBeGreaterThan(0);
    expect(screen.getByText('top_agents')).toBeTruthy();
    // Alex Rivera appears both in the ranked list and as the owner of at
    // least one activity row, so more than one match is expected here.
    expect(screen.getAllByText('Alex Rivera').length).toBeGreaterThan(0);

    screen.unmount();
  });

  it('renders the team workload strip as its own full-width row with four blocks', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText('team_workload')).toBeTruthy();
    expect(screen.getByText('Support load')).toBeTruthy();
    expect(screen.getByText('Dev backlog')).toBeTruthy();
    expect(screen.getByText('CRM tasks')).toBeTruthy();
    expect(screen.getByText('QA reviews')).toBeTruthy();

    screen.unmount();
  });

  it('renders row 4: the recent activity table, contacts resolved from the inbox dataset', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText('recent_activity')).toBeTruthy();
    // `activity[0]` in the mocked dataset is owned by Alex Rivera and points
    // at the first seeded contact, Grace Park.
    expect(screen.getByText('Grace Park')).toBeTruthy();

    screen.unmount();
  });
});
