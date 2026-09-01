import { Avatar, AvatarFallback, Badge, Card, CardContent, CardHeader, CardTitle } from '@gears-frontx/ui-kit';
import type { TopAgent } from '../../api/dashboardTypes';
import type { Translate } from '../../app/i18n';
import { identityToneOf, initialsOf } from '../../shared/format';
import { formatCount } from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type TopAgentsCardProps = {
  agents: TopAgent[];
  t: Translate;
};

/**
 * Row 3's ranked list card: an Avatar plus a resolved-count Badge per agent,
 * ranked by that same count - borrowed from the reference's own "ranked
 * list with avatar + trailing count" block (see the dashboard spec).
 */
export function TopAgentsCard({ agents, t }: TopAgentsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('top_agents')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.topAgentsList}>
        {agents.map((agent, index) => (
          <div className={styles.topAgentRow} key={agent.id}>
            <span className={styles.topAgentRank}>{index + 1}</span>
            <Avatar size="sm">
              <AvatarFallback tone={identityToneOf(agent.name)} variant="solid">
                {initialsOf(agent.name)}
              </AvatarFallback>
            </Avatar>
            <span className={styles.topAgentName}>{agent.name}</span>
            <Badge variant="secondary" className={styles.topAgentBadge}>
              {formatCount(agent.resolvedCount)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
