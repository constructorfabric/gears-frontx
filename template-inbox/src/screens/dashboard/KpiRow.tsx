import type { DashboardKpiCard } from '../../api/dashboardTypes';
import { KpiCard } from './KpiCard';
import styles from '../../styles/dashboard.module.css';

export type KpiRowProps = {
  kpis: DashboardKpiCard[];
};

export function KpiRow({ kpis }: KpiRowProps) {
  return (
    <div className={styles.kpiRow}>
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} />
      ))}
    </div>
  );
}
