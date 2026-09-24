import { clsx } from "clsx";
import type { HTMLAttributes, Ref } from "react";

import styles from "./avatar.module.css";

const AVATAR_WORD_SEPARATOR = /\s+/u;

const AVATAR_SURFACE_COUNT = 7;

const initialsOf = (name: string, locale: string): string => {
  const words = name.trim().split(AVATAR_WORD_SEPARATOR).filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  const first = words[0]?.[0] ?? "";

  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";

  return `${first}${last}`.toLocaleUpperCase(locale);
};

const surfaceIndex = (seed: string): number => {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    const codeUnit = seed.at(index)?.codePointAt(0) ?? 0;
    hash = (hash * 31 + codeUnit) % 997;
  }

  return hash % AVATAR_SURFACE_COUNT;
};

interface AvatarProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  readonly name: string;
  readonly seed?: string;
  readonly locale?: string;
  readonly decorative?: boolean;
  readonly ref?: Ref<HTMLSpanElement>;
}

export const Avatar = ({
  className,
  locale = "en",
  name,
  seed,
  decorative = false,
  ref,
  ...props
}: AvatarProps) => {
  const surface = surfaceIndex(seed ?? name);

  return (
    <span
      {...props}
      ref={ref}
      aria-hidden={decorative || undefined}
      className={clsx(styles.avatar, styles[`surface${surface}`], className)}
      title={decorative ? undefined : name}
    >
      <span aria-hidden="true">{initialsOf(name, locale)}</span>
      {decorative ? null : (
        <span className={styles.screenReaderOnly}>{name}</span>
      )}
    </span>
  );
};

Avatar.displayName = "Avatar";

interface AvatarOverflowProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  readonly count: number;
  readonly label: string;
  readonly ref?: Ref<HTMLSpanElement>;
}

export const AvatarOverflow = ({
  className,
  count,
  label,
  ref,
  ...props
}: AvatarOverflowProps) => (
  <span {...props} ref={ref} className={clsx(styles.overflow, className)}>
    <span aria-hidden="true">{`+${count}`}</span>
    <span className={styles.screenReaderOnly}>{`+${count} ${label}`}</span>
  </span>
);

AvatarOverflow.displayName = "AvatarOverflow";

interface AvatarStackProps extends Omit<
  HTMLAttributes<HTMLUListElement>,
  "ref"
> {
  readonly ref?: Ref<HTMLUListElement>;
}

export const AvatarStack = ({
  className,
  children,
  ref,
  ...props
}: AvatarStackProps) => (
  <ul {...props} ref={ref} className={clsx(styles.stack, className)}>
    {children}
  </ul>
);

AvatarStack.displayName = "AvatarStack";

interface AvatarStackItemProps extends Omit<
  HTMLAttributes<HTMLLIElement>,
  "ref"
> {
  readonly ref?: Ref<HTMLLIElement>;
}

export const AvatarStackItem = ({
  className,
  children,
  ref,
  ...props
}: AvatarStackItemProps) => (
  <li {...props} ref={ref} className={clsx(styles.stackItem, className)}>
    {children}
  </li>
);

AvatarStackItem.displayName = "AvatarStackItem";
