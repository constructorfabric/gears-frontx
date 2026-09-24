import { clsx } from "clsx";
import { ChevronLeft, X } from "lucide-react";
import { createElement, useId } from "react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { useCalendarLocalization } from "../../../i18n/calendar-localization";
import { isPresentNode } from "../react-node-text";

import styles from "./subheader.module.css";

const SUBHEADER_SIZE = { l: "l", m: "m" } as const;

type SubheaderSize = (typeof SUBHEADER_SIZE)[keyof typeof SUBHEADER_SIZE];

const SUBHEADER_SIZE_CLASS: Readonly<Record<SubheaderSize, string>> = {
  l: styles.sizeL,
  m: styles.sizeM,
};

const SUBHEADER_HEADING_TAGS = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
} as const;

type SubheaderHeadingLevel = keyof typeof SUBHEADER_HEADING_TAGS;

type SubheaderHeadingTag =
  (typeof SUBHEADER_HEADING_TAGS)[SubheaderHeadingLevel];

interface SubheaderProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "title" | "ref"
> {
  readonly title: ReactNode;
  readonly size?: SubheaderSize;
  readonly icon?: ReactNode;
  readonly tag?: ReactNode;
  readonly badge?: ReactNode;
  readonly onBack?: () => void;
  readonly onClose?: () => void;
  readonly actions?: ReactNode;
  readonly additionalAction?: ReactNode;
  readonly divider?: boolean;
  readonly headingLevel?: SubheaderHeadingLevel;
  readonly titleId?: string;
  readonly backLabel?: string;
  readonly closeLabel?: string;
  readonly ref?: Ref<HTMLElement>;
}

interface RoundIconButtonProps {
  readonly children: ReactNode;
  readonly className: string;
  readonly label: string;
  readonly onClick: () => void;
}

const RoundIconButton = ({
  className,
  label,
  onClick,
  children,
}: RoundIconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    className={className}
    onClick={onClick}
  >
    {children}
  </button>
);

export const Subheader = ({
  ref,
  className,
  size = SUBHEADER_SIZE.l,
  title,
  icon,
  tag,
  badge,
  onBack,
  onClose,
  actions,
  additionalAction,
  divider = true,
  headingLevel = 2,
  titleId,
  backLabel,
  closeLabel,
  ...props
}: SubheaderProps) => {
  const generatedTitleId = useId();
  const resolvedTitleId = titleId ?? generatedTitleId;
  const headingTag: SubheaderHeadingTag = SUBHEADER_HEADING_TAGS[headingLevel];
  const { t } = useCalendarLocalization();
  const hasActions = isPresentNode(actions) || isPresentNode(additionalAction);

  return (
    <header
      ref={ref}
      className={clsx(styles.subheader, SUBHEADER_SIZE_CLASS[size], className)}
      {...props}
    >
      {onBack === undefined ? null : (
        <RoundIconButton
          label={backLabel ?? t("calendar.subheader.back")}
          onClick={onBack}
          className={styles.roundButton}
        >
          <ChevronLeft aria-hidden="true" />
        </RoundIconButton>
      )}

      <div className={styles.titleGroup}>
        {isPresentNode(icon) ? (
          <span aria-hidden="true" className={styles.icon}>
            {icon}
          </span>
        ) : null}
        {createElement(
          headingTag,
          { className: styles.heading, id: resolvedTitleId },
          title
        )}
        {badge ?? null}
        {tag ?? null}
      </div>

      {hasActions ? (
        <div
          className={clsx(
            styles.actions,
            onClose !== undefined && styles.actionsBeforeClose
          )}
        >
          {actions}
          {additionalAction}
        </div>
      ) : null}

      {onClose === undefined ? null : (
        <RoundIconButton
          label={closeLabel ?? t("calendar.subheader.close")}
          onClick={onClose}
          className={styles.closeButton}
        >
          <X aria-hidden="true" />
        </RoundIconButton>
      )}

      {divider ? <hr className={styles.divider} /> : null}
    </header>
  );
};

Subheader.displayName = "Subheader";
