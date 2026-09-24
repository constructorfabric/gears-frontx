"use client";

import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import type { CalendarDate, CalendarView } from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type {
  CalendarContextProps,
  CalendarTranslate,
} from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useCalendarToolbarController } from "../../react/controllers/use-calendar-toolbar-controller";
import type { ToolbarTitleRange } from "../../react/controllers/use-calendar-toolbar-controller";
import { Button } from "../primitives/button/button";
import { visibleViewOptions } from "./view-options";

import styles from "./calendar-toolbar.module.css";

export interface CalendarToolbarProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** The date the host is showing. The toolbar never changes it. */
  readonly currentDate: CalendarDate;
  /** Controlled view. Selecting another view only calls `onViewChange`. */
  readonly activeView?: CalendarView;
  /** Initial view when uncontrolled. Default `day`. */
  readonly defaultActiveView?: CalendarView;
  /** Called for every view selection. */
  readonly onViewChange: (view: CalendarView) => void;
  /** The Today button was pressed. */
  readonly onToday: () => void;
  /** The previous button was pressed. The host decides what one step is. */
  readonly onPrevious: () => void;
  /** The next button was pressed. */
  readonly onNext: () => void;
  /** Views to offer, in the host's order. Default all four. */
  readonly availableViews?: readonly CalendarView[];
  /** Replaces the title text; the heading's accessible name is kept. */
  readonly renderTitle?: (date: CalendarDate) => ReactNode;
  /** Replaces one view option's visible content. */
  readonly renderViewOption?: (
    view: CalendarView,
    active: boolean
  ) => ReactNode;
  /** Content at the start of the bar. */
  readonly renderLeading?: () => ReactNode;
  /** Content at the end of the bar. */
  readonly renderTrailing?: () => ReactNode;
}

const agendaRangeText = (
  range: ToolbarTitleRange,
  t: CalendarTranslate
): string =>
  range.startYear === range.endYear
    ? t("calendar.agenda.range", range)
    : t("calendar.agenda.rangeCrossYear", range);

const CalendarToolbarContent = ({
  activeView,
  availableViews,
  className,
  currentDate,
  defaultActiveView,
  onNext,
  onPrevious,
  onToday,
  onViewChange,
  renderLeading,
  renderTitle,
  renderTrailing,
  renderViewOption,
}: CalendarToolbarContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();

  const {
    activeView: resolvedView,
    availableViews: visibleViews,
    titleMonth,
    titleYear,
    titleRange,
    selectView,
    handleViewKeyDown,
    registerRadio,
  } = useCalendarToolbarController({
    activeView,
    availableViews,
    currentDate,
    defaultActiveView,
    direction,
    locale,
    onViewChange,
  });

  const options = visibleViewOptions(visibleViews);
  const activeOption =
    options.find((option) => option.value === resolvedView) ?? options[0];

  const accessibleTitle = `${t(activeOption.viewNameKey)} — ${t("calendar.toolbar.selectedDate")} ${currentDate}`;

  const titleText =
    titleRange === null ? titleMonth : agendaRangeText(titleRange, t);

  return (
    <header
      className={clsx(styles.root, className)}
      dir={direction}
      aria-label={t("calendar.toolbar.label")}
    >
      {renderLeading && <div className={styles.leading}>{renderLeading()}</div>}

      <h1 className={styles.title} aria-label={accessibleTitle}>
        {renderTitle ? (
          renderTitle(currentDate)
        ) : (
          <>
            <span className={styles.titleText}>{titleText}</span>
            {titleRange === null && (
              <span className={styles.titleYear}>{` ${titleYear}`}</span>
            )}
          </>
        )}
      </h1>

      <div className={styles.actions}>
        <Button
          className={styles.today}
          size="sm"
          variant="ghost"
          onClick={onToday}
        >
          {t("calendar.toolbar.today")}
        </Button>

        <span className={styles.divider} aria-hidden="true" />

        <div
          className={styles.views}
          role="radiogroup"
          aria-label={t("calendar.toolbar.viewLabel")}
        >
          {options.map((option, index) => {
            const isActive = option.value === resolvedView;

            return (
              <Button
                key={option.value}
                ref={(element) => {
                  registerRadio(option.value, element);
                }}
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                size="sm"
                variant="ghost"
                className={styles.viewOption}
                onClick={() => {
                  selectView(option.value);
                }}
                onKeyDown={(event) => {
                  handleViewKeyDown(event, index);
                }}
              >
                {renderViewOption
                  ? renderViewOption(option.value, isActive)
                  : t(option.labelKey)}
              </Button>
            );
          })}
        </div>

        <div
          className={styles.stepper}
          role="group"
          aria-label={t(activeOption.changeKey)}
        >
          <Button
            size="l"
            variant="ghost"
            aria-label={t(activeOption.previousKey)}
            onlyIcon
            leftIcon={<ChevronLeft />}
            onClick={onPrevious}
          />
          <Button
            size="l"
            variant="ghost"
            aria-label={t(activeOption.nextKey)}
            onlyIcon
            leftIcon={<ChevronRight />}
            onClick={onNext}
          />
        </div>
        {renderTrailing && (
          <div className={styles.trailing}>{renderTrailing()}</div>
        )}
      </div>
    </header>
  );
};

export const CalendarToolbar = (props: CalendarToolbarProps) => (
  <CalendarScope {...props}>
    <CalendarToolbarContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type CalendarToolbarContentProps = Omit<
  CalendarToolbarProps,
  keyof CalendarContextProps
>;
