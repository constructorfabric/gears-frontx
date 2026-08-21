import { Avatar, AvatarBadge, AvatarFallback, type AvatarProps } from '@gears-frontx/ui-kit';
import type { Presence } from '../api/types';
import { initialsOf } from './format';
import styles from '../styles/workspace.module.css';

/**
 * The kit's identity-fill tones. Picked from a hash of the name so the same
 * person keeps the same circle on the list row, in the thread header, in the
 * details panel and in the contacts table - which is what the fill is for. It
 * must not track state; that is what the presence badge does.
 */
const IDENTITY_TONES = ['accent', 'info', 'success', 'warning', 'danger', 'neutral'] as const;

const toneFor = (name: string): (typeof IDENTITY_TONES)[number] => {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }
  return IDENTITY_TONES[hash % IDENTITY_TONES.length];
};

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
      <AvatarFallback tone={toneFor(name)} variant="solid">
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
