"use client";

import { clsx } from "clsx";
import { memo } from "react";
import type { ReactNode } from "react";

import type { CalendarRef } from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { Button } from "../primitives/button/button";
import { Checkbox } from "../primitives/checkbox/checkbox";
import { ListItem } from "../primitives/list/list";

import styles from "./calendar-list.module.css";

export interface CalendarListProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Calendars to list. */
  readonly calendars: readonly CalendarRef[];
  /** Ids of calendars whose checkbox is off. */
  readonly hiddenCalendarIds: readonly string[];
  /** Called with the new hidden ids after a toggle. */
  readonly onHiddenCalendarIdsChange: (
    hiddenCalendarIds: readonly string[]
  ) => void;
  /** Shows a default create button that calls this. */
  readonly onCreateCalendar?: () => void;
  /** Replaces a row's content. */
  readonly renderCalendar?: (
    calendar: CalendarRef,
    hidden: boolean
  ) => ReactNode;
  /** Replaces the create button. */
  readonly renderCreateCalendar?: () => ReactNode;
}

type CalendarListContentProps = Omit<
  CalendarListProps,
  keyof CalendarContextProps
>;

interface CalendarListRowProps {
  readonly calendar: CalendarRef;
  readonly hidden: boolean;
  readonly renderCalendar?: (
    calendar: CalendarRef,
    hidden: boolean
  ) => ReactNode;
  readonly hiddenCalendarIds: readonly string[];
  readonly onHiddenCalendarIdsChange: (
    hiddenCalendarIds: readonly string[]
  ) => void;
}

const ACCENT_CLASSES = new Map<string, string>([
  ["turquoise", styles.accentTurquoise],
  ["purple", styles.accentPurple],
  ["orange", styles.accentOrange],
]);

const CalendarListRowImpl = ({
  calendar,
  hidden,
  hiddenCalendarIds,
  onHiddenCalendarIdsChange,
  renderCalendar,
}: CalendarListRowProps) => {
  const inputId = `calendar-list-${calendar.id}`;
  const accentClassName = ACCENT_CLASSES.get(calendar.colorFamily);

  const handleChange = (): void => {
    onHiddenCalendarIdsChange(
      hidden
        ? hiddenCalendarIds.filter((id) => id !== calendar.id)
        : [...hiddenCalendarIds, calendar.id]
    );
  };

  return (
    <li>
      <ListItem
        className={styles.row}
        control={
          <Checkbox
            aria-label={calendar.name}
            checked={!hidden}
            className={accentClassName}
            id={inputId}
            onChange={handleChange}
          />
        }
        label={
          <label className={styles.label} htmlFor={inputId}>
            <span className={styles.name}>
              {renderCalendar
                ? renderCalendar(calendar, hidden)
                : calendar.name}
            </span>
          </label>
        }
        size="xs"
      />
    </li>
  );
};

const CalendarListRow = memo(CalendarListRowImpl);

const CalendarListContent = ({
  calendars,
  className,
  hiddenCalendarIds,
  onCreateCalendar,
  onHiddenCalendarIdsChange,
  renderCalendar,
  renderCreateCalendar,
}: CalendarListContentProps) => {
  const { direction, t } = useCalendarLocalization();

  const renderCreateAffordance = (): ReactNode => {
    if (renderCreateCalendar) {
      return renderCreateCalendar();
    }

    if (!onCreateCalendar) {
      return null;
    }

    return (
      <Button
        className={styles.createButton}
        size="sm"
        type="button"
        variant="outline"
        onClick={onCreateCalendar}
      >
        {t("calendar.panel.createCalendar")}
      </Button>
    );
  };

  const createAffordance = renderCreateAffordance();
  const hiddenCalendarIdSet = new Set(hiddenCalendarIds);

  return (
    <section
      aria-label={t("calendar.panel.calendars")}
      className={clsx(styles.root, className)}
      dir={direction}
    >
      <h2 className={styles.heading}>{t("calendar.panel.calendars")}</h2>

      <ul className={styles.list}>
        {calendars.map((calendar) => (
          <CalendarListRow
            calendar={calendar}
            hidden={hiddenCalendarIdSet.has(calendar.id)}
            key={calendar.id}
            renderCalendar={renderCalendar}
            hiddenCalendarIds={hiddenCalendarIds}
            onHiddenCalendarIdsChange={onHiddenCalendarIdsChange}
          />
        ))}
      </ul>

      {createAffordance === null || createAffordance === undefined ? null : (
        <div className={styles.create}>{createAffordance}</div>
      )}
    </section>
  );
};

export const CalendarList = (props: CalendarListProps) => (
  <CalendarScope {...props}>
    <CalendarListContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

CalendarList.displayName = "CalendarList";
