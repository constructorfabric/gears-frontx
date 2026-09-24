import { numberFormatter, pluralRules } from "../core/intl-cache";
import type { CalendarLocale } from "../core/model";

/**
 * Flat id → template map for one locale. i18next conventions: `{{name}}` placeholders and
 * `_one`/`_other` plural suffixes, so the same file feeds the kit and a react-i18next host.
 */
export type CalendarTranslations = Readonly<Record<string, string>>;

export type CalendarTranslationValues = Readonly<
  Record<string, string | number>
>;

/** Catalogues by locale. `pt-BR` reads `pt-BR`, then `pt`, then the bundled English. */
export type CalendarMessages = Readonly<Record<string, CalendarTranslations>>;

export type CalendarMissingTranslation = (id: string) => void;

export const ENGLISH_LOCALE = "en";

/** A count picks the plural form, so a caller never builds a category-suffixed id itself. */
export const pluralCandidates = (
  id: string,
  count: number | undefined,
  locale: CalendarLocale
): readonly string[] => {
  if (count === undefined) {
    return [id];
  }

  return [
    ...new Set([`${id}_${pluralRules(locale).select(count)}`, `${id}_other`]),
    id,
  ];
};

/** Returning the id, `""` or `undefined` is a miss, not a translation. */
export const isUsableTranslation = (
  value: unknown,
  id: string
): value is string =>
  typeof value === "string" && value.length > 0 && value !== id;

const interpolate = (
  template: string,
  values: CalendarTranslationValues | undefined,
  locale: CalendarLocale
): string => {
  if (values === undefined) {
    return template;
  }

  const format = numberFormatter(locale);
  let result = template;

  for (const [name, value] of Object.entries(values)) {
    result = result.replaceAll(
      `{{${name}}}`,
      typeof value === "number" ? format.format(value) : value
    );
  }

  return result;
};

/** `pluralLocale` is the catalogue's language: an English fallback counts in English. */
export const readTranslation = (
  translations: CalendarTranslations | undefined,
  id: string,
  values: CalendarTranslationValues | undefined,
  locale: CalendarLocale,
  pluralLocale: CalendarLocale = locale
): string | undefined => {
  if (translations === undefined) {
    return undefined;
  }

  const { count } = values ?? {};

  for (const candidate of pluralCandidates(
    id,
    typeof count === "number" ? count : undefined,
    pluralLocale
  )) {
    const template = translations[candidate];

    if (isUsableTranslation(template, candidate)) {
      return interpolate(template, values, locale);
    }
  }

  return undefined;
};

const canonicalLocale = (locale: CalendarLocale): string => {
  const tag = locale.replaceAll("_", "-");

  try {
    return new Intl.Locale(tag).baseName;
  } catch {
    return tag;
  }
};

/** Most to least specific, then English: `zh-Hant-TW` reads `zh-Hant-TW`, `zh-Hant`, `zh`, `en`. */
export const localeChain = (locale: CalendarLocale): readonly string[] => {
  const parts = canonicalLocale(locale).split("-");
  const chain = parts.map((_, index) =>
    parts.slice(0, parts.length - index).join("-")
  );

  if (parts[0] !== ENGLISH_LOCALE) {
    chain.push(ENGLISH_LOCALE);
  }

  return chain;
};
