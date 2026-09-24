import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as CalendarKit from "../../../index";
import { CalendarLocalizationProvider, CalendarProvider } from "../../../index";
import type {
  CalendarContextProps,
  CalendarLocalizationProps,
  CalendarLocalizationProviderProps,
  CalendarLocalizationValue,
  CalendarMessages,
  CalendarMissingTranslation,
  CalendarProviderProps,
  CalendarTranslate,
  CalendarTranslations,
  CalendarViewerValue,
  IanaTimeZone,
} from "../../../index";
import { ENGLISH_TRANSLATIONS } from "../../english";
import {
  CalendarLocalizationProvider as I18nCalendarLocalizationProvider,
  useCalendarLocalization as i18nUseCalendarLocalization,
} from "../../public";

const CATALOG_IDS = Object.keys(ENGLISH_TRANSLATIONS);

const PLACEHOLDER = /\{\{(?<name>\w+)\}\}/gu;

const placeholdersOf = (template: string): readonly string[] =>
  [...template.matchAll(PLACEHOLDER)].map((match) => match.groups?.name ?? "");

const VALUES = Object.fromEntries(
  CATALOG_IDS.flatMap((id) =>
    placeholdersOf(ENGLISH_TRANSLATIONS[id] ?? "").map((name) => [name, 2])
  )
);

const CatalogProbe = ({ ids }: { readonly ids: readonly string[] }) => {
  const { t } = i18nUseCalendarLocalization();

  return (
    <output data-testid="catalog">
      {JSON.stringify(Object.fromEntries(ids.map((id) => [id, t(id, VALUES)])))}
    </output>
  );
};

const isStringRecord = (value: object): value is Record<string, string> =>
  Object.values(value).every(
    (entry): entry is string => typeof entry === "string"
  );

const parseCatalog = (text: string | null): Record<string, string> => {
  const parsed: unknown = JSON.parse(text ?? "{}");

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !isStringRecord(parsed)
  ) {
    throw new Error("Catalog output must be a string record");
  }
  return parsed;
};

describe("i18n acceptance: public package and catalog", () => {
  it("A20: documented public exports remain framework-neutral", () => {
    expect(CalendarKit.CalendarLocalizationProvider).toBe(
      I18nCalendarLocalizationProvider
    );
    expect(CalendarKit.useCalendarLocalization).toBe(
      i18nUseCalendarLocalization
    );
    expect(CalendarKit.CalendarProvider).toBe(CalendarProvider);
    expect(CalendarKit.getLocaleDirection).toBeTypeOf("function");

    expectTypeOf<CalendarTranslate>().toEqualTypeOf<
      (
        key: string,
        values?: Readonly<Record<string, string | number>>
      ) => string
    >();
    expectTypeOf<CalendarTranslations>().toEqualTypeOf<
      Readonly<Record<string, string>>
    >();
    expectTypeOf<CalendarMessages>().toEqualTypeOf<
      Readonly<Record<string, CalendarTranslations>>
    >();
    expectTypeOf<CalendarMissingTranslation>().toEqualTypeOf<
      (key: string) => void
    >();
    expectTypeOf<CalendarContextProps>().toExtend<{
      readonly locale?: string;
      readonly direction?: "ltr" | "rtl";
      readonly t?: CalendarTranslate;
      readonly translations?: CalendarTranslations;
      readonly timeZone?: IanaTimeZone;
    }>();
    expectTypeOf<CalendarLocalizationProps>().toExtend<{
      readonly locale?: string;
      readonly direction?: "ltr" | "rtl";
      readonly t?: CalendarTranslate;
      readonly translations?: CalendarTranslations;
      readonly messages?: CalendarMessages;
    }>();
    expectTypeOf<CalendarLocalizationProviderProps>().toExtend<{
      readonly onMissingTranslation?: (key: string) => void;
      readonly children?: ReactNode;
    }>();
    expectTypeOf<CalendarProviderProps>().toExtend<{
      readonly timeZone?: IanaTimeZone;
      readonly children?: ReactNode;
    }>();
    expectTypeOf<CalendarLocalizationValue>().toExtend<{
      readonly locale: string;
      readonly direction: "ltr" | "rtl";
      readonly t: CalendarTranslate;
    }>();
    expectTypeOf<CalendarViewerValue>().toExtend<{
      readonly timeZone: IanaTimeZone;
    }>();
  });

  it("A21: every built-in translation resolves with its placeholders filled", () => {
    render(
      <CalendarLocalizationProvider>
        <CatalogProbe ids={CATALOG_IDS} />
      </CalendarLocalizationProvider>
    );

    const catalog = parseCatalog(screen.getByTestId("catalog").textContent);

    for (const id of CATALOG_IDS) {
      expect(catalog[id]).toBeTypeOf("string");
      expect(catalog[id]).not.toBe("");
      expect(catalog[id]).not.toBe(id);
      expect(catalog[id]).not.toMatch(/\{\{\w+\}\}/u);
    }
  });
});
