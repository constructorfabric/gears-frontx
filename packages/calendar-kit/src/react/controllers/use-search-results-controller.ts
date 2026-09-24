import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type {
  CalendarDate,
  CalendarEvent,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import {
  buildSearchGroups,
  countRows,
  MIN_QUERY_LENGTH,
  normalizeQuery,
  rowAt,
  viewerToday,
} from "../../ui/search-results/search-results-format";
import type { SearchResultGroup } from "../../ui/search-results/search-results-format";
import { useControlledValue } from "../hooks/use-controlled-value";

const DEBOUNCE_MS = 200;

export const SEARCH_STATE = {
  empty: "empty",
  results: "results",
  tooShort: "too-short",
} as const;

export type SearchState = (typeof SEARCH_STATE)[keyof typeof SEARCH_STATE];

export interface SearchResultsControllerOptions {
  readonly events: readonly CalendarEvent[];
  readonly query?: string;
  readonly defaultQuery?: string;
  readonly onQueryChange?: (query: string) => void;
  readonly timeZone: IanaTimeZone;
  readonly now: UtcInstant;
  readonly onReveal: (eventId: string, date: CalendarDate) => void;
  readonly onDismiss: () => void;
}

export interface SearchResultsController {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly debouncedQuery: string;
  readonly groups: readonly SearchResultGroup[];
  readonly resultCount: number;
  readonly state: SearchState;
  readonly todayDate: CalendarDate;
  readonly currentInstant: UtcInstant;
  readonly focusedIndex: number;
  readonly setRowRef: (focusIndex: number, element: HTMLElement | null) => void;
  readonly setFocusedRow: (focusIndex: number) => void;
  readonly revealRow: (focusIndex: number) => void;
  readonly handleRowKeyDown: (
    event: ReactKeyboardEvent<HTMLElement>,
    focusIndex: number
  ) => void;
}

const resolveState = (query: string, resultCount: number): SearchState => {
  if (normalizeQuery(query).length < MIN_QUERY_LENGTH) {
    return SEARCH_STATE.tooShort;
  }

  if (resultCount === 0) {
    return SEARCH_STATE.empty;
  }

  return SEARCH_STATE.results;
};

export const useSearchResultsController = (
  options: SearchResultsControllerOptions
): SearchResultsController => {
  const {
    events,
    query,
    defaultQuery = "",
    onQueryChange,
    timeZone,
    now,
    onReveal,
    onDismiss,
  } = options;

  const queryState = useControlledValue<string>({
    defaultValue: defaultQuery,
    onChange: onQueryChange,
    value: query,
  });

  const [debouncedQuery, setDebouncedQuery] = useState(queryState.value);

  const [focusedIndex, setFocusedIndex] = useState(0);

  const rowRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(queryState.value);
      setFocusedIndex(0);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [queryState.value]);

  const groups = useMemo(
    () => buildSearchGroups(events, debouncedQuery, timeZone),
    [debouncedQuery, events, timeZone]
  );

  const resultCount = useMemo(() => countRows(groups), [groups]);

  const todayDate = useMemo(() => viewerToday(now, timeZone), [now, timeZone]);

  const state = resolveState(debouncedQuery, resultCount);

  const setRowRef = useCallback(
    (focusIndex: number, element: HTMLElement | null): void => {
      if (element === null) {
        rowRefs.current.delete(focusIndex);
        return;
      }

      rowRefs.current.set(focusIndex, element);
    },
    []
  );

  const setFocusedRow = (focusIndex: number): void => {
    setFocusedIndex(focusIndex);
  };

  const focusRow = useCallback(
    (index: number): void => {
      const boundedIndex = Math.max(
        0,
        Math.min(Math.max(resultCount - 1, 0), index)
      );
      setFocusedIndex(boundedIndex);
      rowRefs.current.get(boundedIndex)?.focus();
    },
    [resultCount]
  );

  const revealRow = useCallback(
    (focusIndex: number): void => {
      const row = rowAt(groups, focusIndex);

      if (row === undefined) {
        return;
      }

      onReveal(row.event.id, row.date);
    },
    [groups, onReveal]
  );

  const handleRowKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, focusIndex: number): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        revealRow(focusIndex);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }

      let targetIndex: number | undefined;

      switch (event.key) {
        case "ArrowDown": {
          targetIndex = focusIndex + 1;
          break;
        }
        case "ArrowUp": {
          targetIndex = focusIndex - 1;
          break;
        }
        case "Home": {
          targetIndex = 0;
          break;
        }
        case "End": {
          targetIndex = resultCount - 1;
          break;
        }
        default: {
          break;
        }
      }

      if (targetIndex !== undefined) {
        event.preventDefault();
        focusRow(targetIndex);
      }
    },
    [focusRow, onDismiss, resultCount, revealRow]
  );

  return {
    currentInstant: now,
    debouncedQuery,
    focusedIndex,
    groups,
    handleRowKeyDown,
    query: queryState.value,
    resultCount,
    revealRow,
    setFocusedRow,
    setQuery: queryState.setValue,
    setRowRef,
    state,
    todayDate,
  };
};
