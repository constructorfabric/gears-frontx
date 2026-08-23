import type { ComponentType } from 'react';
import { ClipboardCheckIcon, CodeIcon, FolderKanbanIcon, HeadsetIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Progress } from '@gears-frontx/ui-kit';
import type { WorkloadMetric } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { formatCount, workloadPercent } from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type WorkloadStripProps = {
  workload: WorkloadMetric[];
  t: Translate;
};

const ICON_BY_METRIC_ID: Record<string, ComponentType> = {
  'support-load': HeadsetIcon,
  'dev-backlog': CodeIcon,
  'crm-tasks': FolderKanbanIcon,
  'qa-reviews': ClipboardCheckIcon,
};

/**
 * Its own full-width row below row 3: four related workload metrics side by
 * side, icon+value+Progress each - borrowed from the reference's own
 * "icon+value+progress strip" block (see the dashboard spec), widened from
 * three to four blocks so a fourth team dimension (QA) sits alongside
 * Support/Dev/CRM at the same visual weight.
 */
export function WorkloadStrip({ workload, t }: WorkloadStripProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('team_workload')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.workloadStrip}>
        {workload.map((metric) => {
          const Icon = ICON_BY_METRIC_ID[metric.id] ?? FolderKanbanIcon;
          const percent = workloadPercent(metric);
          return (
            <div className={styles.workloadItem} key={metric.id}>
              <span className={styles.workloadIconChip} aria-hidden="true">
                <Icon />
              </span>
              <div className={styles.workloadItemBody}>
                <div className={styles.workloadItemHead}>
                  <span className={styles.workloadLabel}>{metric.label}</span>
                  <span className={styles.workloadValue}>
                    {formatCount(metric.value)}/{formatCount(metric.max)}
                  </span>
                </div>
                <Progress value={percent} aria-label={metric.label} className={styles.workloadProgress} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
