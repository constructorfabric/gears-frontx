"use client";
// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-slots:p1

import { clsx } from "clsx";
import { useContext } from "react";
import type { ReactNode } from "react";

import type { CalendarConflict } from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { conflictIndicatorItemClassesContext } from "./conflict-indicator-context";

import styles from "./conflict-indicator.module.css";

export interface ConflictIndicatorProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Conflicts to show. An empty list renders nothing. */
  readonly conflicts: readonly CalendarConflict[];
  /** One coloured marker per conflict, with the text in its accessible name only. */
  readonly compact?: boolean;
  /** Replaces how each conflict renders; wins over `compact`. */
  readonly renderConflict?: (conflict: CalendarConflict) => ReactNode;
}

const markerName = (conflict: CalendarConflict): string =>
  `${conflict.dimension}: ${conflict.label}`;

const DefaultConflictContent = ({
  conflict,
  compact,
}: {
  readonly conflict: CalendarConflict;
  readonly compact: boolean;
}) => {
  if (compact) {
    return (
      <span
        className={styles.marker}
        role="img"
        aria-label={markerName(conflict)}
      />
    );
  }

  return (
    <>
      <span className={styles.dimension}>{conflict.dimension}</span>
      <span className={styles.label} title={conflict.label}>
        {conflict.label}
      </span>
    </>
  );
};

type ConflictIndicatorContentProps = Omit<
  ConflictIndicatorProps,
  keyof CalendarContextProps
>;

const ConflictIndicatorContent = ({
  className,
  compact = false,
  conflicts,
  renderConflict,
}: ConflictIndicatorContentProps) => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
  const { direction } = useCalendarLocalization();
  const itemClasses = useContext(conflictIndicatorItemClassesContext);

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <ul
      className={clsx(styles.root, compact && styles.compact, className)}
      dir={direction}
    >
      {conflicts.map((conflict) => (
        <li
          key={conflict.id}
          className={clsx(
            styles.item,
            conflict.severity !== undefined && [
              styles[conflict.severity],
              itemClasses[conflict.severity],
            ]
          )}
        >
          {renderConflict === undefined ? (
            <DefaultConflictContent conflict={conflict} compact={compact} />
          ) : (
            renderConflict(conflict)
          )}
        </li>
      ))}
    </ul>
  );
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

export const ConflictIndicator = (props: ConflictIndicatorProps) => (
  <CalendarScope {...props}>
    <ConflictIndicatorContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);
