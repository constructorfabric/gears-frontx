import type { CalendarLocale, CalendarTranslate } from "../core/model";
import en from "./en.json";
import { ENGLISH_LOCALE, readTranslation } from "./translations";
import type {
  CalendarTranslationValues,
  CalendarTranslations,
} from "./translations";

/** Bundled English: the kit renders text with or without a provider. */
export const ENGLISH_TRANSLATIONS: CalendarTranslations = en;

export const FALLBACK_TRANSLATION_ID = "calendar.common.translationUnavailable";

export const FALLBACK_TRANSLATION = "Translation unavailable";

export const englishTranslationFor = (
  id: string,
  values: CalendarTranslationValues | undefined,
  locale: CalendarLocale
): string | undefined =>
  readTranslation(ENGLISH_TRANSLATIONS, id, values, locale, ENGLISH_LOCALE);

/** English on its own: the translator outside any provider. */
export const englishTranslate: CalendarTranslate = (id, values) =>
  englishTranslationFor(id, values, "en-US") ?? id;
