"use client";

import type { ReactNode } from "react";

import { CalendarProvider } from "./calendar-context";
import {
  CalendarLocalizationContext,
  useLocalizationState,
} from "./calendar-localization";
import type {
  CalendarContextProps,
  CalendarLocalizationProviderProps,
} from "./calendar-localization";

/** Sets how a whole calendar speaks. Everything below inherits what it does not set. */
export const CalendarLocalizationProvider = ({
  children,
  onMissingTranslation,
  ...props
}: CalendarLocalizationProviderProps) => {
  const value = useLocalizationState(props, { onMissingTranslation });

  return (
    <CalendarLocalizationContext.Provider value={value}>
      {children}
    </CalendarLocalizationContext.Provider>
  );
};

/**
 * Publishes one component's localization and viewer zone to its subtree, so nested parts and
 * primitives resolve without the props being threaded. Not part of the published API.
 */
export const CalendarScope = ({
  children,
  ...props
}: CalendarContextProps & { readonly children?: ReactNode }) => {
  const value = useLocalizationState(props);

  return (
    <CalendarLocalizationContext.Provider value={value}>
      <CalendarProvider timeZone={props.timeZone}>{children}</CalendarProvider>
    </CalendarLocalizationContext.Provider>
  );
};
