import {
  HeadsetIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailIcon,
  MessageCircleIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
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
import type { AgentIdentity } from '../api/types';
import { labelOf } from '../shared/format';
import { PresenceAvatar } from '../shared/PresenceAvatar';
import type { Translate } from './i18n';
import {
  CONTACTS_ROUTE,
  DASHBOARD_ROUTE,
  INBOX_ROUTE,
  MAIL_ROUTE,
  navigate,
  type Route,
} from './routing';
import type { Theme } from './theme';
import styles from '../styles/workspace.module.css';

/** Which rail destination a route belongs to - a contact's own page keeps
 * Contacts lit, exactly as the reference does. */
const sectionOf = (route: Route): 'dashboard' | 'inbox' | 'mail' | 'contacts' => {
  if (route.name === 'dashboard') return 'dashboard';
  if (route.name === 'inbox') return 'inbox';
  if (route.name === 'mail') return 'mail';
  return 'contacts';
};

export type IconRailProps = {
  route: Route;
  agent: AgentIdentity | undefined;
  theme: Theme;
  onToggleTheme: () => void;
  t: Translate;
};

/**
 * The app's own navigation column: the mark, the sections it ships, and -
 * pushed to the bottom by a flexible spacer - the theme toggle and the profile
 * menu.
 *
 * It is always narrow. The folder and filter columns beside it collapse; this
 * one is the fixed edge of the window that the rest of the layout is measured
 * from, so it has no collapsed state to be in.
 */
export function IconRail({ route, agent, theme, onToggleTheme, t }: IconRailProps) {
  const section = sectionOf(route);
  const isDark = theme === 'dark';

  return (
    <aside className={styles.rail} aria-label={t('main_navigation')}>
      <span className={styles.railMark} aria-hidden="true">
        <HeadsetIcon />
      </span>

      <nav className={styles.railNav} aria-label={t('sections')}>
        <Button
          variant={section === 'dashboard' ? 'secondary' : 'ghost'}
          size="sm"
          icon={<LayoutDashboardIcon />}
          aria-label={t('dashboard')}
          aria-current={section === 'dashboard' ? 'page' : undefined}
          onClick={() => navigate(DASHBOARD_ROUTE)}
        />
        <Button
          variant={section === 'inbox' ? 'secondary' : 'ghost'}
          size="sm"
          icon={<MessageCircleIcon />}
          aria-label={t('chat')}
          aria-current={section === 'inbox' ? 'page' : undefined}
          onClick={() => navigate(INBOX_ROUTE)}
        />
        <Button
          variant={section === 'mail' ? 'secondary' : 'ghost'}
          size="sm"
          icon={<MailIcon />}
          aria-label={t('mail')}
          aria-current={section === 'mail' ? 'page' : undefined}
          onClick={() => navigate(MAIL_ROUTE)}
        />
        <Button
          variant={section === 'contacts' ? 'secondary' : 'ghost'}
          size="sm"
          icon={<UsersIcon />}
          aria-label={t('contacts')}
          aria-current={section === 'contacts' ? 'page' : undefined}
          onClick={() => navigate(CONTACTS_ROUTE)}
        />
      </nav>

      <span className={styles.spacer} />

      <Button
        variant="ghost"
        size="sm"
        icon={isDark ? <SunIcon /> : <MoonIcon />}
        aria-label={isDark ? t('switch_to_light') : t('switch_to_dark')}
        onClick={onToggleTheme}
      />

      <Popover>
        <PopoverTrigger className={styles.railIdentity} aria-label={t('open_profile_menu')}>
          <PresenceAvatar name={agent?.name ?? ''} presence={agent?.presence ?? 'offline'} />
        </PopoverTrigger>
        <PopoverContent side="right" align="end">
          <div className={styles.stack}>
            <div className={styles.railIdentityCard}>
              <PresenceAvatar name={agent?.name ?? ''} presence={agent?.presence ?? 'offline'} />
              <span className={styles.identityLines}>
                <span className={styles.identityName}>{agent?.name ?? t('loading')}</span>
                <span className={styles.identityMeta}>{agent ? labelOf(agent.presence) : ''}</span>
              </span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{t('workspace')}</span>
              <span className={styles.fieldValue}>{agent?.workspace ?? ''}</span>
            </div>
            <Separator aria-hidden="true" />
            {/*
              Inert, exactly as the reference's are: profile, settings and log
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
    </aside>
  );
}
