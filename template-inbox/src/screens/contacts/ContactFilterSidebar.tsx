import {
  Badge,
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from '@gears-frontx/ui-kit';
import type { Contact } from '../../api/types';
import type { Translate } from '../../app/i18n';
import { cx } from '../../shared/cx';
import {
  CONTACT_FILTERS,
  CONTACT_FILTER_LABEL_KEY,
  countForFilter,
  type ContactFilter,
} from './contactFilters';
import styles from '../../styles/workspace.module.css';

export type ContactFilterSidebarProps = {
  contacts: Contact[];
  selectedFilter: ContactFilter;
  onSelectFilter: (filter: ContactFilter) => void;
  collapsed: boolean;
  t: Translate;
};

export function ContactFilterSidebar({
  contacts,
  selectedFilter,
  onSelectFilter,
  collapsed,
  t,
}: ContactFilterSidebarProps) {
  return (
    <aside
      className={cx(styles.sidebar, collapsed && styles.sidebarCollapsed)}
      aria-label={t('contact_filters')}
      aria-hidden={collapsed}
    >
      <div className={styles.paneHeader}>
        <span className={styles.paneTitle}>{t('contacts')}</span>
      </div>
      <nav className={styles.sidebarBody}>
        <ItemGroup>
          {CONTACT_FILTERS.map((filter) => (
            <Item
              key={filter}
              size="sm"
              className={styles.folderItem}
              variant={filter === selectedFilter ? 'muted' : 'default'}
              render={
                <button
                  type="button"
                  onClick={() => onSelectFilter(filter)}
                  aria-current={filter === selectedFilter ? 'true' : undefined}
                />
              }
            >
              <ItemContent>
                <ItemTitle>{t(CONTACT_FILTER_LABEL_KEY[filter])}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Badge variant="secondary">{countForFilter(contacts, filter)}</Badge>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </nav>
    </aside>
  );
}
