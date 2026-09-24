import type { CalendarDirection, CalendarLocale } from "../core/model";

// `getTextInfo` is newer than the ES2022 lib, so it is read defensively.
type LocaleWithTextInfo = Intl.Locale & {
  readonly textInfo?: { readonly direction?: string };
  getTextInfo?: () => { readonly direction?: string };
};

// Firefox before 153 has no text info at all, so the script decides there.
const RTL_SCRIPTS: ReadonlySet<string> = new Set([
  "Adlm",
  "Arab",
  "Hebr",
  "Mand",
  "Mend",
  "Nkoo",
  "Rohg",
  "Samr",
  "Syrc",
  "Thaa",
]);

const directionOf = (locale: LocaleWithTextInfo): string | undefined =>
  locale.getTextInfo?.().direction ??
  locale.textInfo?.direction ??
  (RTL_SCRIPTS.has(locale.maximize().script ?? "") ? "rtl" : undefined);

/**
 * Direction of a locale, so a host only sets `direction` to force one. Safe on the server and
 * for a locale `Intl` does not know: anything unresolved reads `ltr`.
 */
export const getLocaleDirection = (
  locale: CalendarLocale
): CalendarDirection => {
  try {
    return directionOf(new Intl.Locale(locale)) === "rtl" ? "rtl" : "ltr";
  } catch {
    return "ltr";
  }
};
