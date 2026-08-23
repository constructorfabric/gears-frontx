import { getInboxApi } from '../api/registry';
import { useApiQuery } from '../api/queries';
import { ContactsScreen } from '../screens/contacts/ContactsScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { InboxScreen } from '../screens/inbox/InboxScreen';
import { MailScreen } from '../screens/mail/MailScreen';
import { IconRail } from './IconRail';
import { t } from './i18n';
import { useRoute } from './routing';
import { useTheme } from './theme';
import styles from '../styles/workspace.module.css';

/**
 * The whole window: the icon rail on the left, and whichever section the URL
 * fragment names filling the rest.
 *
 * The agent identity is read here rather than inside the rail because both the
 * rail's profile menu and the screens' own chrome show the same person; one
 * read, deduplicated by the query cache, keeps them from disagreeing while the
 * request is in flight.
 */
export function App() {
  const route = useRoute();
  const { theme, toggleTheme } = useTheme();
  const agentQuery = useApiQuery(getInboxApi().getAgent);

  return (
    <div className={styles.app}>
      <IconRail
        route={route}
        agent={agentQuery.data?.agent}
        theme={theme}
        onToggleTheme={toggleTheme}
        t={t}
      />
      {route.name === 'dashboard' ? (
        <DashboardScreen t={t} />
      ) : route.name === 'inbox' ? (
        <InboxScreen t={t} />
      ) : route.name === 'mail' ? (
        <MailScreen t={t} />
      ) : (
        <ContactsScreen
          openContactId={route.name === 'contact' ? route.contactId : null}
          t={t}
        />
      )}
    </div>
  );
}
