import type { ReactElement } from 'react';
import { InboxIcon, ShieldAlertIcon } from 'lucide-react';
import {
  Badge,
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@gears-frontx/ui-kit';
import type { Translate } from '../../app/i18n';
import type { Folder } from '../../api/types';
import { cx } from '../../shared/cx';
import styles from '../../styles/workspace.module.css';

const FOLDER_ICON: Record<Folder['icon'], ReactElement> = {
  inbox: <InboxIcon />,
  'shield-alert': <ShieldAlertIcon />,
};

export type FolderSidebarProps = {
  folders: Folder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  collapsed: boolean;
  t: Translate;
};

export function FolderSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  collapsed,
  t,
}: FolderSidebarProps) {
  return (
    <aside
      className={cx(styles.sidebar, collapsed && styles.sidebarCollapsed)}
      aria-label={t('folders')}
      // Kept in the tree while collapsed so the width transition has something
      // to animate, and hidden from assistive tech so a zero-width column is
      // not read out as a live navigation region.
      aria-hidden={collapsed}
    >
      <div className={styles.paneHeader}>
        <span className={styles.paneTitle}>{t('inbox')}</span>
      </div>
      <nav className={styles.sidebarBody}>
        <ItemGroup>
          {folders.map((folder) => (
            <Item
              key={folder.id}
              size="sm"
              variant={folder.id === selectedFolderId ? 'muted' : 'default'}
              render={
                <button
                  type="button"
                  onClick={() => onSelectFolder(folder.id)}
                  aria-current={folder.id === selectedFolderId ? 'true' : undefined}
                />
              }
            >
              <ItemMedia variant="icon">{FOLDER_ICON[folder.icon]}</ItemMedia>
              <ItemContent>
                <ItemTitle>{folder.label}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Badge variant="secondary">{folder.itemCount}</Badge>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </nav>
    </aside>
  );
}
