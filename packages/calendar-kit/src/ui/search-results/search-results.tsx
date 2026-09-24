"use client";

import { clsx } from "clsx";
import { createContext, memo, useContext } from "react";
import type { ReactNode } from "react";

import type { CalendarDate, CalendarEvent, UtcInstant } from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import {
  SEARCH_STATE,
  useSearchResultsController,
} from "../../react/controllers/use-search-results-controller";
import { List, ListItem } from "../primitives/list/list";
import {
  formatSearchCount,
  formatSearchDayHeader,
  formatSearchResultDetails,
} from "./search-results-format";
import type {
  SearchResultGroup as SearchResultGroupData,
  SearchResultRow,
} from "./search-results-format";

import styles from "./search-results.module.css";

export interface SearchResultContext {
  /** The day (`YYYY-MM-DD`) the row is grouped under. */
  readonly group: string;
  /** Position within that day. */
  readonly index: number;
}

export interface SearchResultsProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Events to search. */
  readonly events: readonly CalendarEvent[];
  /** Controlled query. */
  readonly query?: string;
  /** Initial query when uncontrolled. */
  readonly defaultQuery?: string;
  /** Called when the query changes. */
  readonly onQueryChange?: (query: string) => void;
  /** Reference instant for the Today group. */
  readonly now: UtcInstant;
  /** A result was activated. Receives the event id and the viewer day of the row. */
  readonly onReveal: (eventId: string, date: CalendarDate) => void;
  /** Escape was pressed on a result. */
  readonly onDismiss: () => void;
  /** Replaces a row's content. */
  readonly renderResult?: (
    event: CalendarEvent,
    context: SearchResultContext
  ) => ReactNode;
  /** Replaces a day heading. */
  readonly renderGroupHeader?: (group: string, count: number) => ReactNode;
}

type SearchResultsControllerValue = ReturnType<
  typeof useSearchResultsController
>;

const SearchResultsControllerContext =
  createContext<SearchResultsControllerValue | null>(null);

const useSearchResultsControllerContext = (): SearchResultsControllerValue => {
  const value = useContext(SearchResultsControllerContext);

  if (value === null) {
    throw new Error("Search result rows must be rendered inside SearchResults");
  }

  return value;
};

const isUnnamed = (row: SearchResultRow): boolean =>
  row.event.title.trim() === "";

const DefaultResultContent = ({ row }: DefaultResultContentProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const title = isUnnamed(row)
    ? t("calendar.eventCard.unnamed")
    : row.event.title;

  return (
    <span className={styles.content}>
      <span className={styles.title}>{title}</span>
      <span className={styles.details}>
        {formatSearchResultDetails(row, timeZone, locale, t)}
      </span>
    </span>
  );
};

const SearchResultItemImpl = ({
  group,
  index,
  renderResult,
  row,
}: SearchResultItemProps) => {
  const controller = useSearchResultsControllerContext();
  const { t } = useCalendarLocalization();

  return (
    <ListItem
      label={
        <button
          ref={(element) => {
            controller.setRowRef(row.focusIndex, element);
          }}
          type="button"
          aria-label={
            isUnnamed(row) ? t("calendar.eventCard.unnamed") : undefined
          }
          className={styles.result}
          data-event-id={row.event.id}
          onClick={() => {
            controller.revealRow(row.focusIndex);
          }}
          onFocus={() => {
            controller.setFocusedRow(row.focusIndex);
          }}
          onKeyDown={(event) => {
            controller.handleRowKeyDown(event, row.focusIndex);
          }}
          tabIndex={controller.focusedIndex === row.focusIndex ? 0 : -1}
        >
          {renderResult ? (
            renderResult(row.event, { group: group.date, index })
          ) : (
            <DefaultResultContent row={row} />
          )}
        </button>
      }
      interactive={false}
      size="xs"
    />
  );
};

const SearchResultItem = memo(SearchResultItemImpl);

const SearchResultGroup = ({
  group,
  renderGroupHeader,
  renderResult,
}: SearchResultGroupProps) => {
  const controller = useSearchResultsControllerContext();
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const isToday = group.date === controller.todayDate;

  return (
    <section
      className={styles.group}
      role="listitem"
      aria-labelledby={`search-group-${group.date}`}
    >
      <h3
        className={clsx(styles.day, isToday && styles.dayToday)}
        id={`search-group-${group.date}`}
        aria-current={isToday ? "date" : undefined}
      >
        {renderGroupHeader
          ? renderGroupHeader(group.date, group.rows.length)
          : formatSearchDayHeader(
              group.date,
              group.dayStart,
              controller.todayDate,
              timeZone,
              locale,
              t
            )}
      </h3>

      <div className={styles.rows}>
        {group.rows.map((row, index) => (
          <SearchResultItem
            group={group}
            index={index}
            key={row.key}
            renderResult={renderResult}
            row={row}
          />
        ))}
      </div>
    </section>
  );
};

const SearchResultsContent = ({
  className,
  defaultQuery,
  events,
  onDismiss,
  onQueryChange,
  onReveal,
  now,
  query,
  renderGroupHeader,
  renderResult,
}: SearchResultsContentProps) => {
  const { direction, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const controller = useSearchResultsController({
    defaultQuery,
    events,
    now,
    onDismiss,
    onQueryChange,
    onReveal,
    query,
    timeZone,
  });

  return (
    <section
      aria-label={t("calendar.panel.searchResults")}
      className={clsx(styles.results, className)}
      dir={direction}
    >
      <div
        className={styles.liveRegion}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {controller.state === SEARCH_STATE.results
          ? formatSearchCount(controller.resultCount, t)
          : ""}
      </div>

      <SearchResultsControllerContext.Provider value={controller}>
        <List className={styles.groups}>
          {controller.state === SEARCH_STATE.tooShort ? (
            <p>{t("calendar.panel.searchTooShort")}</p>
          ) : null}
          {controller.groups.map((group) => (
            <SearchResultGroup
              group={group}
              key={group.date}
              renderGroupHeader={renderGroupHeader}
              renderResult={renderResult}
            />
          ))}
        </List>
      </SearchResultsControllerContext.Provider>
    </section>
  );
};

export const SearchResults = (props: SearchResultsProps) => (
  <CalendarScope {...props}>
    <SearchResultsContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type SearchResultsContentProps = Omit<
  SearchResultsProps,
  keyof CalendarContextProps
>;

SearchResults.displayName = "SearchResults";

interface SearchResultGroupProps {
  readonly group: SearchResultGroupData;
  readonly renderGroupHeader?: (group: string, count: number) => ReactNode;
  readonly renderResult?: (
    event: CalendarEvent,
    context: SearchResultContext
  ) => ReactNode;
}

interface SearchResultItemProps {
  readonly group: SearchResultGroupData;
  readonly index: number;
  readonly renderResult?: (
    event: CalendarEvent,
    context: SearchResultContext
  ) => ReactNode;
  readonly row: SearchResultRow;
}

interface DefaultResultContentProps {
  readonly row: SearchResultRow;
}
