import { Avatar, AvatarFallback, type AvatarProps } from '@gears-frontx/ui-kit';
import { identityToneOf, initialsOf } from './format';

export type IdentityAvatarProps = {
  name: string;
  size?: AvatarProps['size'];
};

/**
 * `PresenceAvatar` without the presence badge, for the identities this app
 * renders that carry no live state of their own - a mail correspondent, not a
 * chat contact. Same tone hash and the same initials, so a person who
 * appears in both domains would read as the same circle in either.
 */
export function IdentityAvatar({ name, size }: IdentityAvatarProps) {
  return (
    <Avatar size={size}>
      <AvatarFallback tone={identityToneOf(name)} variant="solid">
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
