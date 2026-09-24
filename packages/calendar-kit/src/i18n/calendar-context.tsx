"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type { IanaTimeZone } from "../core/model";
import { parseIanaTimeZone } from "../core/validation";

/** The zone every date and time is shown in. Not localization: a viewer can read one language. */
export interface CalendarViewerProps {
  /** Viewer time zone. Default `UTC`. */
  readonly timeZone?: IanaTimeZone;
}

export interface CalendarViewerValue {
  /** Resolved viewer zone. */
  readonly timeZone: IanaTimeZone;
}

export interface CalendarProviderProps extends CalendarViewerProps {
  /** The calendar UI. */
  readonly children?: ReactNode;
}

const DEFAULT_TIME_ZONE = parseIanaTimeZone("UTC");

const CalendarViewerContext = createContext<CalendarViewerValue>({
  timeZone: DEFAULT_TIME_ZONE,
});

/** Sets the viewer zone of a whole calendar. Everything below inherits it. */
export const CalendarProvider = ({
  children,
  ...props
}: CalendarProviderProps) => {
  const parent = useContext(CalendarViewerContext);
  const timeZone = props.timeZone ?? parent.timeZone;

  const value = useMemo(() => ({ timeZone }), [timeZone]);

  return (
    <CalendarViewerContext.Provider value={value}>
      {children}
    </CalendarViewerContext.Provider>
  );
};

export const useCalendarContext = (): CalendarViewerValue =>
  useContext(CalendarViewerContext);
