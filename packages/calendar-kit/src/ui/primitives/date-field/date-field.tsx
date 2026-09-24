"use client";

import { Calendar } from "@gears-frontx/ui-kit/calendar";
import { clsx } from "clsx";
import { CalendarDaysIcon, XIcon } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { Ref } from "react";

import type { CalendarDate } from "../../../core/model";
import { calendarDate } from "../../../core/validation";
import { useCalendarLocalization } from "../../../i18n/calendar-localization";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { Input } from "../input/input";
import { Popover } from "../popover/popover";
import { resolvePortalContainer } from "../portal-layer";
import {
  formatCalendarCaption,
  formatDayLabel,
  formatDayNumber,
  formatWeekdayInitials,
} from "./date-field-format";
import { useDateEntry } from "./use-date-entry";

import styles from "./date-field.module.css";

/** Monday-first, as the design system's date picker draws its weeks. */
const DEFAULT_WEEK_START = 1;

const EMPTY_RECT = new DOMRect(0, 0, 0, 0);

/** Local dates keep react-day-picker's own local-time day arithmetic intact. */
const toLocalDate = (value: CalendarDate): Date =>
  new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10))
  );

const toCalendarDate = (date: Date): CalendarDate => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return calendarDate(`${year}-${month}-${day}`);
};

type FieldTranslate = CalendarTranslate;

interface FieldTexts {
  readonly calendar: string;
  readonly clear: string;
  readonly open: string;
}

const fieldTexts = (
  t: FieldTranslate,
  overrides: {
    readonly calendarLabel?: string;
    readonly clearLabel?: string;
    readonly openCalendarLabel?: string;
  }
): FieldTexts => ({
  calendar: overrides.calendarLabel ?? t("calendar.dateField.chooseDate"),
  clear: overrides.clearLabel ?? t("calendar.dateField.clear"),
  open: overrides.openCalendarLabel ?? t("calendar.dateField.openCalendar"),
});

const useCalendarLabels = (locale: string, t: FieldTranslate) => {
  const formatters = useMemo(
    () => ({
      formatCaption: (month: Date) => formatCalendarCaption(month, locale),
      formatDay: (day: Date) => formatDayNumber(day, locale),
      formatWeekdayName: (weekday: Date) =>
        formatWeekdayInitials(weekday, locale),
    }),
    [locale]
  );

  const labels = useMemo(
    () => ({
      labelDayButton: (day: Date) => formatDayLabel(day, locale),
      labelNext: () => t("calendar.monthNavigator.nextMonth"),
      labelPrevious: () => t("calendar.monthNavigator.previousMonth"),
    }),
    [locale, t]
  );

  return { formatters, labels };
};

export interface DateFieldProps {
  readonly value: CalendarDate | "";
  readonly onValueChange: (value: CalendarDate | "") => void;
  readonly locale: string;
  readonly id?: string;
  /** Month the calendar opens on while the field is empty; defaults to today. */
  readonly defaultMonthDate?: CalendarDate;
  readonly weekStart?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  /** Control height; the compact size matches the design's inline form rows. */
  readonly size?: "m" | "xl";
  /** Shows a clear control while the field holds a value; the row can go empty again. */
  readonly clearable?: boolean;
  readonly clearLabel?: string;
  readonly openCalendarLabel?: string;
  readonly calendarLabel?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
  readonly ref?: Ref<HTMLInputElement>;
}

const DateField = ({
  ref,
  value,
  onValueChange,
  locale,
  id,
  defaultMonthDate,
  weekStart = DEFAULT_WEEK_START,
  disabled = false,
  invalid = false,
  size = "xl",
  clearable = false,
  clearLabel,
  openCalendarLabel,
  calendarLabel,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: DateFieldProps) => {
  const { t } = useCalendarLocalization();
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(
    null
  );

  const setAnchor = useCallback((element: HTMLDivElement | null): void => {
    anchorRef.current = element;

    setAnchorElement((current) => (current === element ? current : element));
  }, []);

  const getAnchorRect = useCallback(
    (): DOMRect => anchorRef.current?.getBoundingClientRect() ?? EMPTY_RECT,
    []
  );

  const setInputRef = useCallback(
    (element: HTMLInputElement | null): void => {
      inputRef.current = element;

      if (typeof ref === "function") {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    },
    [ref]
  );

  const [visibleMonth, setVisibleMonth] = useState<Date>();

  const openCalendar = useCallback((): void => {
    const anchorDate = value === "" ? (defaultMonthDate ?? "") : value;

    setVisibleMonth(anchorDate === "" ? new Date() : toLocalDate(anchorDate));
    setAnchorRect(anchorRef.current?.getBoundingClientRect() ?? EMPTY_RECT);
  }, [defaultMonthDate, value]);

  const closeCalendar = useCallback((): void => {
    setAnchorRect(null);
  }, []);

  const entry = useDateEntry({
    clearable,
    inputRef,
    locale,
    onOpenCalendar: openCalendar,
    onValueChange,
    reference: value === "" ? toCalendarDate(new Date()) : value,
    value,
  });

  const { formatters, labels } = useCalendarLabels(locale, t);
  const texts = fieldTexts(t, {
    calendarLabel,
    clearLabel,
    openCalendarLabel,
  });

  const showClear = clearable && entry.filled && !disabled;

  return (
    <div ref={setAnchor} className={clsx(styles.field, className)}>
      <Input
        ref={setInputRef}
        id={fieldId}
        type="text"
        size={size}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={entry.text}
        disabled={disabled}
        invalid={invalid}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className={clsx(styles.control, !entry.filled && styles.unfilled)}
        leadingAction={
          <button
            type="button"
            className={styles.action}
            disabled={disabled}
            aria-label={texts.open}
            aria-haspopup="dialog"
            aria-expanded={anchorRect !== null}
            onClick={openCalendar}
          >
            <CalendarDaysIcon
              aria-hidden="true"
              className={styles.actionIcon}
            />
          </button>
        }
        action={
          showClear ? (
            <button
              type="button"
              className={styles.action}
              aria-label={texts.clear}
              onClick={() => {
                entry.reset();
                onValueChange("");
                inputRef.current?.focus();
              }}
            >
              <XIcon aria-hidden="true" className={styles.actionIcon} />
            </button>
          ) : undefined
        }
        onFocus={entry.handleFocus}
        onBlur={entry.handleBlur}
        onClick={entry.handleClick}
        onKeyDown={entry.handleKeyDown}
        onPaste={entry.handlePaste}
        onChange={entry.handleChange}
      />

      {anchorElement === null || anchorRect === null ? null : (
        <Popover
          open
          onOpenChange={closeCalendar}
          anchorRect={anchorRect}
          anchorRectProvider={getAnchorRect}
          anchorElement={anchorElement}
          align="center"
          container={resolvePortalContainer(anchorElement)}
          label={texts.calendar}
          className={styles.panel}
        >
          <Calendar
            autoFocus
            mode="single"
            className={styles.calendar}
            formatters={formatters}
            labels={labels}
            month={visibleMonth}
            selected={value === "" ? undefined : toLocalDate(value)}
            showOutsideDays
            weekStartsOn={weekStart}
            onMonthChange={setVisibleMonth}
            onSelect={(date) => {
              if (date === undefined) {
                return;
              }

              entry.reset();
              onValueChange(toCalendarDate(date));
              closeCalendar();
            }}
          />
        </Popover>
      )}
    </div>
  );
};

DateField.displayName = "DateField";

export { DateField };
