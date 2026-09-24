import { clsx } from "clsx";
import { X } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { useCalendarLocalization } from "../../../i18n/calendar-localization";

import styles from "./tag.module.css";

type TagColor =
  | "basic"
  | "neutral"
  | "red"
  | "yellow"
  | "blue"
  | "orange"
  | "mint"
  | "brown"
  | "green"
  | "pink"
  | "turquoise"
  | "purple"
  | "magenta";

type TagVariant = "regular" | "stroke" | "strong";

type TagSize = "l" | "m" | "s";

const capitalize = (value: string): string =>
  `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

interface TagProps extends Omit<HTMLAttributes<HTMLSpanElement>, "ref"> {
  readonly color?: TagColor;
  readonly variant?: TagVariant;
  readonly size?: TagSize;
  readonly icon?: ReactNode;
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
  readonly ref?: Ref<HTMLSpanElement>;
}

export const Tag = ({
  ref,
  className,
  color = "neutral",
  variant = "regular",
  size = "m",
  icon,
  onDismiss,
  dismissLabel,
  children,
  ...props
}: TagProps) => {
  const { t } = useCalendarLocalization();

  return (
    <span
      ref={ref}
      className={clsx(
        styles.tag,
        styles[`color${capitalize(color)}`],
        styles[`variant${capitalize(variant)}`],
        styles[`size${capitalize(size)}`],
        className
      )}
      {...props}
    >
      {(icon ?? null) === null ? null : (
        <span aria-hidden="true" className={styles.icon}>
          {icon}
        </span>
      )}
      {children}
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel ?? t("calendar.tag.remove")}
          className={styles.dismiss}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          <X aria-hidden="true" className={styles.dismissIcon} />
        </button>
      ) : null}
    </span>
  );
};

Tag.displayName = "Tag";
