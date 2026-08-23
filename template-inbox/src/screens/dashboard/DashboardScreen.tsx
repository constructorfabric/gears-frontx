import { Skeleton } from '@gears-frontx/ui-kit';
import { useApiQuery } from '../../api/queries';
import { getDashboardApi, getInboxApi } from '../../api/registry';
import type { Translate } from '../../app/i18n';
import { ActivityTable } from './ActivityTable';
import { ConversionBySourceCard } from './ConversionBySourceCard';
import { KpiRow } from './KpiRow';
import { NewContactsCard } from './NewContactsCard';
import { RecordsCreatedCard } from './RecordsCreatedCard';
import { ResolvedPerDayCard } from './ResolvedPerDayCard';
import { StageFunnelCard } from './StageFunnelCard';
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
 * sidebar: a single full-width, scrollable pane holding six rows - KPIs,
 * the resolved/new-contacts/summary trio, records-created plus top agents,
 * the full-width team-workload strip, the new stage-funnel plus
 * conversion-by-source pair, and finally the activity table - fed by one
 * `getDashboard` fetch plus the inbox service's own `getContacts` (the
 * activity table reuses those contact identities rather than inventing new
 * people - see `dashboardDataset.ts`).
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
        <KpiRow kpis={data.kpis} contactsByStage={data.contactsByStage} t={t} />

        <div className={dashboardStyles.rowTwo}>
          <ResolvedPerDayCard data={data.resolvedPerDay} t={t} />
          <NewContactsCard newContacts={data.newContacts} t={t} />
          <SummaryCard activity={data.activity} trend={data.summaryTrend} t={t} />
        </div>

        <div className={dashboardStyles.rowThree}>
          <RecordsCreatedCard records={data.recordsCreated} t={t} />
          <TopAgentsCard agents={data.topAgents} t={t} />
        </div>

        <WorkloadStrip workload={data.workload} t={t} />

        <div className={dashboardStyles.rowFunnel}>
          <StageFunnelCard stages={data.stageFunnel} t={t} />
          <ConversionBySourceCard sources={data.conversionBySource} t={t} />
        </div>

        <ActivityTable activity={data.activity} contacts={contacts} t={t} />
      </div>
    </div>
  );
}
