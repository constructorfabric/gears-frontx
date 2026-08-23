import type { ContactStageSegment, DashboardKpiCard } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { ContactsByStageCard } from './ContactsByStageCard';
import { KpiCard } from './KpiCard';
import styles from '../../styles/dashboard.module.css';

export type KpiRowProps = {
  kpis: DashboardKpiCard[];
  contactsByStage: ContactStageSegment[];
  t: Translate;
};

export function KpiRow({ kpis, contactsByStage, t }: KpiRowProps) {
  return (
    <div className={styles.kpiRow}>
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} />
      ))}
      <ContactsByStageCard segments={contactsByStage} t={t} />
    </div>
  );
}
