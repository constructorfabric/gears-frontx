import { Skeleton } from '@gears-frontx/ui-kit';
import { useApiQuery } from '../../api/queries';
import { getDashboardApi, getInboxApi } from '../../api/registry';
import type { Translate } from '../../app/i18n';
import { ActivityTable } from './ActivityTable';
import { KpiRow } from './KpiRow';
import { NewContactsCard } from './NewContactsCard';
import { ResolvedPerDayCard } from './ResolvedPerDayCard';
import { SummaryCard } from './SummaryCard';
import { TopAgentsCard } from './TopAgentsCard';
import { WorkloadStrip } from './WorkloadStrip';
import dashboardStyles from '../../styles/dashboard.module.css';
import layoutStyles from '../../styles/workspace.module.css';

export type DashboardScreenProps = {
  t: Translate;
};

/**
 * The dashboard's top-level orchestration - the app's first rail entry and
 * its default landing route. Unlike Chat/Mail/Contacts it has no secondary
 * sidebar: a single full-width, scrollable pane holding the four rows the
 * dashboard spec lays out, fed by one `getDashboard` fetch plus the inbox
 * service's own `getContacts` (row 4's activity table reuses those contact
 * identities rather than inventing new people - see `dashboardDataset.ts`).
 */
export function DashboardScreen({ t }: DashboardScreenProps) {
  const dashboardService = getDashboardApi();
  const inboxService = getInboxApi();

  const dashboardQuery = useApiQuery(dashboardService.getDashboard);
  const contactsQuery = useApiQuery(inboxService.getContacts);

  if (dashboardQuery.isLoading || contactsQuery.isLoading) {
    return (
      <div className={dashboardStyles.dashboardMain}>
        <div className={layoutStyles.emptyPane} role="status" aria-busy="true">
          <Skeleton style={{ height: '2rem', width: '16rem' }} />
        </div>
      </div>
    );
  }

  const data = dashboardQuery.data;
  const contacts = contactsQuery.data?.contacts ?? [];

  if (!data) return null;

  return (
    <div className={dashboardStyles.dashboardMain}>
      <div className={layoutStyles.paneHeader}>
        <span className={layoutStyles.paneTitle}>{t('dashboard')}</span>
      </div>
      <div className={dashboardStyles.dashboardBody}>
        <KpiRow kpis={data.kpis} />

        <div className={dashboardStyles.rowTwo}>
          <ResolvedPerDayCard data={data.resolvedPerDay} t={t} />
          <NewContactsCard newContacts={data.newContacts} t={t} />
          <SummaryCard activity={data.activity} trend={data.summaryTrend} t={t} />
        </div>

        <div className={dashboardStyles.rowThree}>
          <WorkloadStrip workload={data.workload} t={t} />
          <TopAgentsCard agents={data.topAgents} t={t} />
        </div>

        <ActivityTable activity={data.activity} contacts={contacts} t={t} />
      </div>
    </div>
  );
}
