import { clsx } from "clsx";
import {
  Check,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { createContext, useContext } from "react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { useCalendarLocalization } from "../../../i18n/calendar-localization";
import { isPresentNode } from "../react-node-text";

import styles from "./list.module.css";

type ListSize = "m" | "s" | "xs";

type ListItemVariant = "default" | "danger";

const INDENT_STEP_PX = 20;

const SIZE_CLASSES: Record<ListSize, string> = {
  m: styles.sizeM,
  s: styles.sizeS,
  xs: styles.sizeXs,
};

const VARIANT_CLASSES: Record<ListItemVariant, string> = {
  danger: styles.variantDanger,
  default: styles.variantDefault,
};

const ListSizeContext = createContext<ListSize>("m");

interface ListIndentProps {
  readonly level: number;
}

const ListIndent = ({ level }: ListIndentProps) => {
  if (level <= 0) {
    return null;
  }

  return (
    <span
      aria-hidden
      className={styles.indent}
      style={{ width: level * INDENT_STEP_PX }}
    />
  );
};

interface ListItemIconProps {
  readonly children: ReactNode;
}

const ListItemIcon = ({ children }: ListItemIconProps) => (
  <span className={styles.itemIcon}>{children}</span>
);

interface ListItemIconButtonProps {
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => void;
}

const ListItemIconButton = ({
  label,
  disabled,
  onClick,
  children,
}: ListItemIconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    className={styles.iconButton}
  >
    {children}
  </button>
);

interface ListProps extends Omit<HTMLAttributes<HTMLDivElement>, "ref"> {
  readonly size?: ListSize;
  readonly ref?: Ref<HTMLDivElement>;
}

export const List = ({
  ref,
  size = "m",
  className,
  children,
  ...props
}: ListProps) => (
  <ListSizeContext.Provider value={size}>
    <div
      ref={ref}
      role="list"
      className={clsx(styles.list, className)}
      {...props}
    >
      {children}
    </div>
  </ListSizeContext.Provider>
);

List.displayName = "List";

interface ListHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "ref"> {
  readonly icon?: ReactNode;
  readonly level?: number;
  readonly ref?: Ref<HTMLDivElement>;
}

export const ListHeader = ({
  ref,
  level = 0,
  icon,
  className,
  children,
  ...props
}: ListHeaderProps) => (
  <div
    ref={ref}
    role="presentation"
    className={clsx(styles.header, className)}
    {...props}
  >
    <ListIndent level={level} />
    {isPresentNode(icon) ? (
      <span className={styles.headerIcon}>{icon}</span>
    ) : null}
    <span className={styles.truncate}>{children}</span>
  </div>
);

ListHeader.displayName = "ListHeader";

interface ListItemAppearance {
  readonly interactive?: boolean;
  readonly size?: ListSize;
  readonly variant?: ListItemVariant;
}

interface ListItemProps
  extends
    Omit<HTMLAttributes<HTMLDivElement>, "ref" | "title">,
    Pick<ListItemAppearance, "variant"> {
  readonly actionLabel?: string;
  readonly avatar?: ReactNode;
  readonly badge?: ReactNode;
  readonly checked?: boolean;
  readonly control?: ReactNode;
  readonly cover?: ReactNode;
  readonly disabled?: boolean;
  readonly divider?: boolean;
  readonly dragHandle?: boolean;
  readonly dragging?: boolean;
  readonly editing?: boolean;
  readonly hasChild?: boolean;
  readonly invalid?: boolean;
  readonly interactive?: boolean;
  readonly label: ReactNode;
  readonly leftIcon?: ReactNode;
  readonly level?: number;
  readonly moreLabel?: string;
  readonly onAction?: () => void;
  readonly onMore?: () => void;
  readonly ref?: Ref<HTMLDivElement>;
  readonly rightIcon?: ReactNode;
  readonly selected?: boolean;
  readonly size?: ListSize;
  readonly subtitle?: ReactNode;
  readonly support?: ReactNode;
  readonly tag?: ReactNode;
  readonly trailing?: ReactNode;
}

interface ListItemLeadingProps {
  readonly avatar: ReactNode;
  readonly control: ReactNode;
  readonly cover: ReactNode;
  readonly dragHandle: boolean;
  readonly leftIcon: ReactNode;
}

const ListItemLeading = ({
  dragHandle,
  control,
  avatar,
  leftIcon,
  cover,
}: ListItemLeadingProps) => (
  <>
    {dragHandle ? (
      <ListItemIcon>
        <GripVertical className={styles.dragHandleIcon} aria-hidden />
      </ListItemIcon>
    ) : null}
    {isPresentNode(control) ? (
      <span className={styles.control}>{control}</span>
    ) : null}
    {isPresentNode(avatar) ? (
      <span className={styles.avatar}>{avatar}</span>
    ) : null}
    {isPresentNode(leftIcon) ? <ListItemIcon>{leftIcon}</ListItemIcon> : null}
    {isPresentNode(cover) ? (
      <span className={styles.shrink}>{cover}</span>
    ) : null}
  </>
);

interface ListItemBodyProps {
  readonly editing: boolean;
  readonly invalid: boolean;
  readonly label: ReactNode;
  readonly subtitle: ReactNode;
}

const ListItemBody = ({
  label,
  subtitle,
  editing,
  invalid,
}: ListItemBodyProps) => (
  <div
    className={clsx(
      styles.body,
      editing && styles.editing,
      invalid && styles.invalid
    )}
  >
    <span className={styles.label}>{label}</span>
    {isPresentNode(subtitle) ? (
      <span className={styles.subtitle}>{subtitle}</span>
    ) : null}
  </div>
);

interface ListItemTrailingProps {
  readonly actionLabel?: string;
  readonly badge: ReactNode;
  readonly checked?: boolean;
  readonly disabled: boolean;
  readonly hasChild?: boolean;
  readonly moreLabel?: string;
  readonly onAction?: () => void;
  readonly onMore?: () => void;
  readonly rightIcon: ReactNode;
  readonly support: ReactNode;
  readonly tag: ReactNode;
  readonly trailing: ReactNode;
}

const ListItemTrailing = ({
  tag,
  support,
  trailing,
  rightIcon,
  onAction,
  onMore,
  checked = false,
  hasChild = false,
  badge,
  actionLabel,
  moreLabel,
  disabled,
}: ListItemTrailingProps) => {
  const { t } = useCalendarLocalization();

  return (
    <>
      {isPresentNode(tag) ? <span className={styles.shrink}>{tag}</span> : null}
      {isPresentNode(support) ? (
        <span className={styles.support}>{support}</span>
      ) : null}
      {isPresentNode(trailing) ? (
        <span className={styles.trailing}>{trailing}</span>
      ) : null}
      {isPresentNode(rightIcon) ? (
        <ListItemIcon>{rightIcon}</ListItemIcon>
      ) : null}
      {onAction === undefined ? null : (
        <ListItemIconButton
          label={actionLabel ?? t("calendar.list.add")}
          disabled={disabled}
          onClick={onAction}
        >
          <Plus aria-hidden />
        </ListItemIconButton>
      )}
      {onMore === undefined ? null : (
        <ListItemIconButton
          label={moreLabel ?? t("calendar.list.moreOptions")}
          disabled={disabled}
          onClick={onMore}
        >
          <MoreHorizontal aria-hidden />
        </ListItemIconButton>
      )}
      {checked ? (
        <ListItemIcon>
          <Check aria-hidden />
        </ListItemIcon>
      ) : null}
      {hasChild ? (
        <ListItemIcon>
          <ChevronRight className={styles.chevronIcon} aria-hidden />
        </ListItemIcon>
      ) : null}
      {isPresentNode(badge) ? (
        <span className={styles.badgeSlot}>{badge}</span>
      ) : null}
    </>
  );
};

interface ListItemClassNameInput {
  readonly checked: boolean;
  readonly className?: string;
  readonly disabled: boolean;
  readonly dragging: boolean;
  readonly framed: boolean;
  readonly interactive: boolean;
  readonly selected: boolean;
  readonly size: ListSize;
  readonly variant: ListItemVariant;
}

const listItemClassName = ({
  size,
  variant,
  interactive,
  selected,
  checked,
  disabled,
  dragging,
  framed,
  className,
}: ListItemClassNameInput): string =>
  clsx(
    styles.item,
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    interactive && styles.interactive,
    selected && styles.selected,
    checked && styles.checked,
    disabled && styles.disabled,
    dragging && styles.dragging,
    framed && styles.framed,
    className
  );

export const ListItem = ({
  ref,
  label,
  size: sizeProp,
  variant = "default",
  level = 0,
  subtitle,
  support,
  tag,
  badge,
  control,
  avatar,
  cover,
  leftIcon,
  rightIcon,
  trailing,
  selected = false,
  checked = false,
  disabled = false,
  dragging = false,
  dragHandle = false,
  hasChild = false,
  editing = false,
  invalid = false,
  divider = false,
  interactive,
  actionLabel,
  moreLabel,
  onAction,
  onMore,
  className,
  role,
  ...props
}: ListItemProps) => {
  const inheritedSize = useContext(ListSizeContext);
  const size = sizeProp ?? inheritedSize;
  const framed = editing || invalid;
  const isInteractive = interactive ?? !disabled;

  const itemClassName = listItemClassName({
    checked,
    className,
    disabled,
    dragging,
    framed,
    interactive: isInteractive,
    selected,
    size,
    variant,
  });

  return (
    <div ref={ref} className={styles.itemWrapper}>
      <div
        role={role}
        aria-disabled={disabled || undefined}
        aria-selected={role === "option" ? selected : undefined}
        className={itemClassName}
        {...props}
      >
        <ListIndent level={level} />

        <ListItemLeading
          dragHandle={dragHandle}
          control={control}
          avatar={avatar}
          leftIcon={leftIcon}
          cover={cover}
        />

        <ListItemBody
          label={label}
          subtitle={subtitle}
          editing={editing}
          invalid={invalid}
        />

        <ListItemTrailing
          tag={tag}
          support={support}
          trailing={trailing}
          rightIcon={rightIcon}
          onAction={onAction}
          onMore={onMore}
          checked={checked}
          hasChild={hasChild}
          badge={badge}
          actionLabel={actionLabel}
          moreLabel={moreLabel}
          disabled={disabled}
        />
      </div>

      {divider ? (
        <div className={styles.dividerRow} role="presentation">
          <div className={styles.divider} />
        </div>
      ) : null}
    </div>
  );
};

ListItem.displayName = "ListItem";

interface ListTagProps extends Omit<HTMLAttributes<HTMLSpanElement>, "ref"> {
  readonly ref?: Ref<HTMLSpanElement>;
}

export const ListTag = ({
  ref,
  className,
  children,
  ...props
}: ListTagProps) => (
  <span ref={ref} className={clsx(styles.tag, className)} {...props}>
    {children}
  </span>
);

ListTag.displayName = "ListTag";

interface ListBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "ref"> {
  readonly ref?: Ref<HTMLSpanElement>;
}

export const ListBadge = ({
  ref,
  className,
  children,
  ...props
}: ListBadgeProps) => (
  <span ref={ref} className={clsx(styles.badge, className)} {...props}>
    {children}
  </span>
);

ListBadge.displayName = "ListBadge";
