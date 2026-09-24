"use client";

import { clsx } from "clsx";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { formatCalendarList } from "../../core/format";
import type { CalendarDate, CalendarEvent, UtcInstant } from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useMonthNavigatorController } from "../../react/controllers/use-month-navigator-controller";
import { Button } from "../primitives/button/button";
import {
  formatNavigatorDayLabel,
  formatNavigatorDayNumber,
  formatNavigatorWeekday,
} from "./month-navigator-format";

import styles from "./month-navigator.module.css";

export interface MonthNavigatorProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Controlled selected day. Changing it moves the visible month. */
  readonly selectedDate?: CalendarDate;
  /** Initial selected day when uncontrolled. Default today. */
  readonly defaultSelectedDate?: CalendarDate;
  /** Events used to put a dot on each day they touch. */
  readonly events: readonly CalendarEvent[];
  /** Reference instant for today. Omit to follow the wall clock. */
  readonly now?: UtcInstant;
  /** Called on click, Enter and Space, even for the selected day. */
  readonly onSelectDate: (date: CalendarDate) => void;
  /** Replaces the day number. */
  readonly renderDay?: (date: CalendarDate, hasEvents: boolean) => ReactNode;
  /** Replaces the month title. Receives the first day of the visible month. */
  readonly renderHeader?: (date: CalendarDate) => ReactNode;
}

type MonthNavigatorContentProps = Omit<
  MonthNavigatorProps,
  keyof CalendarContextProps
>;

const MonthNavigatorContent = ({
  className,
  defaultSelectedDate,
  events,
  now,
  onSelectDate,
  renderDay,
  renderHeader,
  selectedDate,
}: MonthNavigatorContentProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const controller = useMonthNavigatorController({
    defaultSelectedDate,
    events,
    locale,
    now,
    onSelectDate,
    selectedDate,
    timeZone,
  });

  const {
    weeks,
    monthStart,
    monthEndExclusive,
    titleMonth,
    titleYear,
    datesWithEvents,
    focusedDate,
    todayDate,
  } = controller;

  const [headerWeek] = weeks;

  return (
    <section
      className={clsx(styles.navigator, className)}
      aria-label={t("calendar.panel.monthNavigator")}
    >
      <div className={styles.header}>
        <Button
          variant="ghost"
          size="s"
          onlyIcon
          leftIcon={<ChevronLeftIcon />}
          aria-label={t("calendar.monthNavigator.previousMonth")}
          onClick={() => {
            controller.goToPreviousMonth();
          }}
        />

        {renderHeader === undefined ? (
          <h3 className={styles.title}>
            {titleMonth} <span className={styles.titleYear}>{titleYear}</span>
          </h3>
        ) : (
          renderHeader(monthStart)
        )}

        <Button
          variant="ghost"
          size="s"
          onlyIcon
          leftIcon={<ChevronRightIcon />}
          aria-label={t("calendar.monthNavigator.nextMonth")}
          onClick={() => {
            controller.goToNextMonth();
          }}
        />
      </div>

      <div
        className={styles.grid}
        role="grid"
        aria-label={t("calendar.panel.monthGrid")}
      >
        <div className={styles.row} role="row">
          {headerWeek.dates.map((date) => (
            <span key={date} role="columnheader" className={styles.weekday}>
              {formatNavigatorWeekday(date, locale)}
            </span>
          ))}
        </div>

        {weeks.map((week) => (
          <div key={week.key} className={styles.row} role="row">
            {week.dates.map((date) => {
              const isOutside = date < monthStart || date >= monthEndExclusive;
              const hasEvents = datesWithEvents.has(date);
              const isSelected = date === controller.selectedDate;
              const dayLabel = formatNavigatorDayLabel(date, locale);

              return (
                <div
                  key={date}
                  ref={(element) => {
                    controller.setDayRef(date, element);
                  }}
                  className={clsx(
                    styles.day,
                    isOutside && styles.dayOutside,
                    date === todayDate && styles.dayToday,
                    isSelected && styles.daySelected,
                    hasEvents && styles.dayHasEvents
                  )}
                  role="gridcell"
                  aria-label={
                    hasEvents
                      ? formatCalendarList(locale, [
                          dayLabel,
                          t("calendar.panel.dayHasEvents"),
                        ])
                      : dayLabel
                  }
                  aria-selected={isSelected}
                  tabIndex={date === focusedDate ? 0 : -1}
                  onClick={() => {
                    controller.selectDate(date);
                  }}
                  onKeyDown={(event) => {
                    controller.handleDayKeyDown(event, date);
                  }}
                >
                  {renderDay === undefined
                    ? formatNavigatorDayNumber(date, locale)
                    : renderDay(date, hasEvents)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
};

export const MonthNavigator = (props: MonthNavigatorProps) => (
  <CalendarScope {...props}>
    <MonthNavigatorContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);
