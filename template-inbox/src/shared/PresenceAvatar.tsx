import { Avatar, AvatarBadge, AvatarFallback, type AvatarProps } from '@gears-frontx/ui-kit';
import type { Presence } from '../api/types';
import { identityToneOf, initialsOf } from './format';
import styles from '../styles/workspace.module.css';

const PRESENCE_CLASS: Record<Presence, string> = {
  online: styles.presenceOnline,
  away: styles.presenceAway,
  offline: styles.presenceOffline,
};

const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'Online',
  away: 'Away',
  offline: 'Offline',
};

export type PresenceAvatarProps = {
  name: string;
  presence: Presence;
  size?: AvatarProps['size'];
};

export function PresenceAvatar({ name, presence, size }: PresenceAvatarProps) {
  return (
    <Avatar size={size}>
      <AvatarFallback tone={identityToneOf(name)} variant="solid">
        {initialsOf(name)}
      </AvatarFallback>
      <AvatarBadge
        className={PRESENCE_CLASS[presence]}
        role="img"
        aria-label={PRESENCE_LABEL[presence]}
      />
    </Avatar>
  );
}
