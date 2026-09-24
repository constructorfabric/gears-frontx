"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type {
  CalendarDirection,
  CalendarLocale,
  CalendarTranslate,
} from "../core/model";
import type { CalendarViewerProps } from "./calendar-context";
import { getLocaleDirection } from "./direction";
import {
  FALLBACK_TRANSLATION,
  FALLBACK_TRANSLATION_ID,
  englishTranslate,
  englishTranslationFor,
} from "./english";
import {
  isUsableTranslation,
  localeChain,
  readTranslation,
} from "./translations";
import type {
  CalendarMessages,
  CalendarMissingTranslation,
  CalendarTranslationValues,
  CalendarTranslations,
} from "./translations";

type CalendarLookup = (
  id: string,
  values: CalendarTranslationValues | undefined
) => string | undefined;

/** Everything a calendar needs to speak: locale, direction, translator and the text behind it. */
export interface CalendarLocalizationProps {
  /** BCP 47 locale for dates, numbers and plural rules. Default `en-US`. */
  readonly locale?: CalendarLocale;
  /** Text direction. Defaults to the direction of the resolved locale. */
  readonly direction?: CalendarDirection;
  /** Host translator, consulted after a component's own `translations`. */
  readonly t?: CalendarTranslate;
  /** Catalogues by locale. `pt-BR` reads `pt-BR`, then `pt`, then the bundled English. */
  readonly messages?: CalendarMessages;
}

export interface CalendarLocalizationValue {
  /** Resolved locale. */
  readonly locale: CalendarLocale;
  /** Resolved direction. */
  readonly direction: CalendarDirection;
  /** Translator that walks every layer. */
  readonly t: CalendarTranslate;
}

export interface CalendarLocalizationProviderProps extends CalendarLocalizationProps {
  /** Reports ids nothing could resolve, once each per provider. */
  readonly onMissingTranslation?: CalendarMissingTranslation;
  /** The calendar UI. */
  readonly children?: ReactNode;
}

/** Props a component hands to the scopes it opens. */
export interface CalendarContextProps
  extends CalendarLocalizationProps, CalendarViewerProps {
  /**
   * Text for the active locale, used in place of the provider's. A component renders in exactly
   * one locale, so this stays flat; a whole calendar takes `messages` instead.
   */
  readonly translations?: CalendarTranslations;
}

export const omitCalendarContextProps = <Props extends CalendarContextProps>(
  props: Props
): Omit<Props, keyof CalendarContextProps> => {
  const {
    direction: _direction,
    locale: _locale,
    messages: _messages,
    t: _t,
    timeZone: _timeZone,
    translations: _translations,
    ...contentProps
  } = props;

  return contentProps;
};

interface CalendarLocalizationState extends CalendarLocalizationValue {
  readonly explicitDirection?: CalendarDirection;
  readonly hostT?: CalendarTranslate;
  readonly messages: CalendarMessages;
  readonly onMissingTranslation?: CalendarMissingTranslation;
  readonly missingIds: Set<string>;
}

export const CalendarLocalizationContext =
  createContext<CalendarLocalizationState>({
    direction: "ltr",
    locale: "en-US",
    messages: {},
    missingIds: new Set<string>(),
    t: englishTranslate,
  });

/**
 * A component's `translations` outrank the host translator so one component can be retexted in
 * place; the provider's catalogues lose to it so a host that translates everything keeps
 * ownership.
 */
const buildTranslate = (
  state: Omit<CalendarLocalizationState, "t">,
  instanceTranslations: CalendarTranslations | undefined
): CalendarTranslate => {
  const { hostT, locale, messages, missingIds, onMissingTranslation } = state;

  const readCatalogues: CalendarLookup = (id, values) => {
    for (const candidate of localeChain(locale)) {
      const resolved = readTranslation(
        messages[candidate],
        id,
        values,
        locale,
        candidate
      );

      if (resolved !== undefined) {
        return resolved;
      }
    }

    return englishTranslationFor(id, values, locale);
  };

  const readHost: CalendarLookup = (id, values) => {
    const value = hostT?.(id, values);

    return isUsableTranslation(value, id) ? value : undefined;
  };

  return (id, values) => {
    const resolved =
      readTranslation(instanceTranslations, id, values, locale) ??
      readHost(id, values) ??
      readCatalogues(id, values);

    if (resolved !== undefined) {
      return resolved;
    }

    if (onMissingTranslation !== undefined && !missingIds.has(id)) {
      missingIds.add(id);
      onMissingTranslation(id);
    }

    return (
      englishTranslationFor(FALLBACK_TRANSLATION_ID, values, locale) ??
      FALLBACK_TRANSLATION
    );
  };
};

export const useLocalizationState = (
  { direction, locale, messages, t, translations }: CalendarContextProps,
  provider?: { readonly onMissingTranslation?: CalendarMissingTranslation }
): CalendarLocalizationState => {
  const parent = useContext(CalendarLocalizationContext);
  const isProvider = provider !== undefined;
  const onMissingTranslation = provider?.onMissingTranslation;

  const instanceTranslations = isProvider ? undefined : translations;

  return useMemo(() => {
    const resolvedLocale = locale ?? parent.locale;
    const explicitDirection = direction ?? parent.explicitDirection;

    const state = {
      direction: explicitDirection ?? getLocaleDirection(resolvedLocale),
      explicitDirection,
      hostT: t ?? parent.hostT,
      locale: resolvedLocale,
      messages: messages ?? parent.messages,
      missingIds: isProvider ? new Set<string>() : parent.missingIds,
      onMissingTranslation: onMissingTranslation ?? parent.onMissingTranslation,
    };

    return { ...state, t: buildTranslate(state, instanceTranslations) };
  }, [
    direction,
    instanceTranslations,
    isProvider,
    locale,
    messages,
    onMissingTranslation,
    parent,
    t,
  ]);
};

export const useCalendarLocalization = (): CalendarLocalizationValue => {
  const { direction, locale, t } = useContext(CalendarLocalizationContext);

  return useMemo(() => ({ direction, locale, t }), [direction, locale, t]);
};

export type { CalendarTranslate } from "../core/model";
