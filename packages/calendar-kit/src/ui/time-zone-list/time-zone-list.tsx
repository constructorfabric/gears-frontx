"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";

import type {
  CalendarTimeZoneOption,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import { readTimeZoneOption } from "../../core/time-zones";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useControlledValue } from "../../react/hooks/use-controlled-value";
import { Button } from "../primitives/button/button";

import styles from "./time-zone-list.module.css";

export interface TimeZoneListProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Zones to offer, with host labels. Invalid ids are skipped. */
  readonly options: readonly CalendarTimeZoneOption[];
  /** Instant every offset is computed at. */
  readonly referenceInstant: UtcInstant;
  /** Controlled selected zone. */
  readonly selectedTimeZoneId?: IanaTimeZone | null;
  /** Initial selected zone when uncontrolled. */
  readonly defaultSelectedTimeZoneId?: IanaTimeZone | null;
  /** Called with the pressed zone, or `null` when the selected row is pressed again. */
  readonly onSelectionChange: (timeZoneId: IanaTimeZone | null) => void;
  /** Replaces a row's content. */
  readonly renderOption?: (
    option: CalendarTimeZoneOption,
    offset: string,
    selected: boolean
  ) => ReactNode;
}

type TimeZoneListContentProps = Omit<
  TimeZoneListProps,
  keyof CalendarContextProps
>;

const TimeZoneListContent = ({
  className,
  defaultSelectedTimeZoneId,
  onSelectionChange,
  options,
  referenceInstant,
  renderOption,
  selectedTimeZoneId,
}: TimeZoneListContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();
  const selection = useControlledValue<IanaTimeZone | null>({
    defaultValue: defaultSelectedTimeZoneId ?? null,
    onChange: onSelectionChange,
    value: selectedTimeZoneId,
  });

  const renderableOptions = options.flatMap((option) =>
    readTimeZoneOption(option, referenceInstant, locale)
  );

  const selectTimeZone = (timeZoneId: IanaTimeZone): void => {
    selection.setValue(selection.value === timeZoneId ? null : timeZoneId);
  };

  return (
    <section
      aria-label={t("calendar.panel.timeZones")}
      className={clsx(styles.root, className)}
      dir={direction}
    >
      <h3 className={styles.heading}>{t("calendar.panel.timeZones")}</h3>
      {renderableOptions.map(({ option, offset }) => {
        const selected = selection.value === option.id;

        return (
          <Button
            aria-pressed={selected}
            className={styles.option}
            key={option.id}
            variant="ghost"
            onClick={() => {
              selectTimeZone(option.id);
            }}
          >
            {renderOption ? (
              renderOption(option, offset, selected)
            ) : (
              <>
                <span className={styles.label}>{option.label}</span>
                <span className={styles.offset}>{offset}</span>
              </>
            )}
          </Button>
        );
      })}
    </section>
  );
};

export const TimeZoneList = (props: TimeZoneListProps) => (
  <CalendarScope {...props}>
    <TimeZoneListContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);
