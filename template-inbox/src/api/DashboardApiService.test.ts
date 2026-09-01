import { describe, expect, it } from 'vitest';
import { contacts } from './dataset';
import { getDashboardApi, registerApiServices } from './registry';

/**
 * The dashboard counterpart to `MailApiService.test.ts` - one suite that
 * goes through the real service, so a project that forgets `useMocks` on
 * this service specifically renders an empty dashboard rather than failing
 * silently.
 */
describe('DashboardApiService', () => {
  it('answers the whole dashboard snapshot from the seeded dataset instead of the network', async () => {
    registerApiServices();

    const {
      kpis,
      resolvedPerDay,
      newContacts,
      recordsCreated,
      contactsByStage,
      workload,
      stageFunnel,
      conversionBySource,
      topAgents,
      activity,
    } = await getDashboardApi().getDashboard.fetch();

    expect(kpis.map((kpi) => kpi.id)).toEqual([
      'open-conversations',
      'resolved-this-week',
      'avg-first-response',
    ]);
    expect(resolvedPerDay).toHaveLength(7);
    expect(newContacts.series).toHaveLength(7);
    expect(recordsCreated).toHaveLength(12);
    expect(contactsByStage).toHaveLength(5);
    expect(workload).toHaveLength(4);
    expect(stageFunnel).toHaveLength(5);
    expect(conversionBySource).toHaveLength(5);
    expect(topAgents.length).toBeGreaterThan(0);
    expect(activity.length).toBeGreaterThan(10);
  });

  it('carries a delta-comparable previous value for every KPI, distinct from its series', async () => {
    registerApiServices();

    const { kpis } = await getDashboardApi().getDashboard.fetch();

    for (const kpi of kpis) {
      expect(typeof kpi.previousValue).toBe('number');
      expect(kpi.series.length).toBeGreaterThan(0);
    }
  });

  it('points every activity row at a contact the inbox dataset actually seeds', async () => {
    registerApiServices();

    const { activity } = await getDashboardApi().getDashboard.fetch();
    const contactIds = new Set(contacts.map((contact) => contact.id));

    for (const item of activity) {
      expect(contactIds.has(item.contactId)).toBe(true);
    }
  });

  it('includes Alex Rivera among the agents recent activity can be owned by', async () => {
    registerApiServices();

    const { activity, topAgents } = await getDashboardApi().getDashboard.fetch();

    expect(topAgents.some((agent) => agent.name === 'Alex Rivera')).toBe(true);
    expect(activity.some((item) => item.ownerAgentName === 'Alex Rivera')).toBe(true);
  });

  it('keeps "Resolved per day"\'s per-source stack consistent with the "Resolved this week" KPI', async () => {
    registerApiServices();

    const { kpis, resolvedPerDay } = await getDashboardApi().getDashboard.fetch();
    const resolvedThisWeek = kpis.find((kpi) => kpi.id === 'resolved-this-week');

    // Every day's chat+mail+tasks stack matches that same day's entry in the
    // KPI card's own series - the two never carry independently-drifting
    // numbers (see `RESOLVED_PER_DAY_TOTAL` in `dashboardDataset.ts`).
    resolvedPerDay.forEach((point, index) => {
      expect(point.chat + point.mail + point.tasks).toBe(resolvedThisWeek?.series[index]);
    });
  });
});
