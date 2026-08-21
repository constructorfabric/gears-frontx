import { LogOutIcon, MoonIcon, SettingsIcon, SunIcon, UserIcon } from 'lucide-react';
import {
  Button,
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
} from '@gears-frontx/ui-kit';
import type { ChildMfeBridge } from '@gears-frontx/react';
import type { AgentIdentity } from '../api/types';
import { labelOf } from './format';
import { PresenceAvatar } from './PresenceAvatar';
import { setWorkspaceTheme } from './workspaceChrome';
import { useHostTheme, useOverlayContainer } from './workspaceRuntime';
import styles from '../styles/workspace.module.css';

export type WorkspaceSidebarFooterProps = {
  bridge: ChildMfeBridge;
  agent: AgentIdentity | undefined;
  t: (key: string) => string;
};

/**
 * The theme toggle and the profile menu, at the bottom of the workspace's own
 * left column.
 *
 * The reference puts both at the bottom of its icon rail. Ours cannot: the
 * host renders its menu, header and footer with no children slot and registers
 * no slot for the sidebar, popup or overlay domains, so the screen extension's
 * own mount area is the only surface a template can reach.
 */
export function WorkspaceSidebarFooter({ bridge, agent, t }: WorkspaceSidebarFooterProps) {
  const theme = useHostTheme(bridge);
  const container = useOverlayContainer();
  const isDark = theme === 'dark';

  return (
    <div className={styles.sidebarFooter}>
      <Popover>
        <PopoverTrigger className={styles.sidebarIdentity} aria-label={t('open_profile_menu')}>
          <PresenceAvatar
            name={agent?.name ?? ''}
            presence={agent?.presence ?? 'offline'}
            size="sm"
          />
          <span className={styles.identityLines}>
            <span className={styles.identityName}>{agent?.name ?? t('loading')}</span>
            <span className={styles.identityMeta}>
              {agent ? labelOf(agent.presence) : ''}
            </span>
          </span>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" container={container}>
          <div className={styles.stack}>
            <div className={styles.sidebarIdentity}>
              <PresenceAvatar
                name={agent?.name ?? ''}
                presence={agent?.presence ?? 'offline'}
              />
              <span className={styles.identityLines}>
                <span className={styles.identityName}>{agent?.name ?? ''}</span>
                <span className={styles.identityMeta}>
                  {agent ? labelOf(agent.presence) : ''}
                </span>
              </span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{t('workspace')}</span>
              <span className={styles.fieldValue}>{agent?.workspace ?? ''}</span>
            </div>
            <Separator aria-hidden="true" />
            {/*
              Inert, exactly as the reference's are: profile, settings and sign
              out are all dead links in it, and this template ships no screen
              behind any of them. They stay disabled rather than silently doing
              nothing, so the affordance does not lie.
            */}
            <ItemGroup>
              <Item size="sm" aria-disabled="true">
                <ItemMedia variant="icon">
                  <UserIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('profile')}</ItemTitle>
                </ItemContent>
              </Item>
              <Item size="sm" aria-disabled="true">
                <ItemMedia variant="icon">
                  <SettingsIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('settings')}</ItemTitle>
                </ItemContent>
              </Item>
              <Separator aria-hidden="true" />
              <Item size="sm" aria-disabled="true">
                <ItemMedia variant="icon">
                  <LogOutIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('log_out')}</ItemTitle>
                </ItemContent>
              </Item>
            </ItemGroup>
          </div>
        </PopoverContent>
      </Popover>
      <span className={styles.spacer} />
      <Button
        variant="ghost"
        size="sm"
        icon={isDark ? <SunIcon /> : <MoonIcon />}
        aria-label={isDark ? t('switch_to_light') : t('switch_to_dark')}
        onClick={() => setWorkspaceTheme(bridge, isDark ? 'light' : 'dark')}
      />
    </div>
  );
}
