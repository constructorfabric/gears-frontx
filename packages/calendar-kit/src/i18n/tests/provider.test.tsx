import { render, screen } from "@testing-library/react";
import { memo } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  explicitTranslate,
  identityTranslate,
  providerTranslate,
} from "../../__test-utils__/fixtures";
import { parseIanaTimeZone } from "../../core/model";
import { CalendarProvider, useCalendarContext } from "../calendar-context";
import { useCalendarLocalization } from "../calendar-localization";
import type { CalendarLocalizationProps } from "../calendar-localization";
import { CalendarLocalizationProvider } from "../calendar-localization-provider";

const NEW_YORK = parseIanaTimeZone("America/New_York");
const TOKYO = parseIanaTimeZone("Asia/Tokyo");

const PROVIDER_TRANSLATIONS = {
  "calendar.grid.label": "Grille du calendrier",
};

const providerTranslateWithMiss = (key: string) =>
  key === "calendar.grid.label" ? key : providerTranslate(key);

const nestedChildRender = vi.fn<() => void>();

const NestedChild = () => {
  nestedChildRender();

  return <output data-testid="nested-child">nested child</output>;
};

const MemoizedChild = memo(NestedChild);

const PluralProbe = () => {
  const { t } = useCalendarLocalization();

  return (
    <output>
      {t("calendar.month.eventCount", { count: 1 })}|
      {t("calendar.month.eventCount", { count: 2 })}
    </output>
  );
};

const Probe = () => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  return (
    <output>
      {locale}|{timeZone}|{direction}|{t("calendar.grid.label")}|
      {t("calendar.month.label")}
    </output>
  );
};

const ProviderProbe = (overrides: CalendarLocalizationProps) => (
  <CalendarLocalizationProvider {...overrides}>
    <Probe />
  </CalendarLocalizationProvider>
);

describe("CalendarLocalizationProvider and useCalendarLocalization", () => {
  it("uses built-in English defaults without a provider", () => {
    render(<Probe />);

    expect(
      screen.getByText("en-US|UTC|ltr|Calendar grid|Month grid")
    ).toBeInTheDocument();
  });

  it("resolves provider configuration and translations", () => {
    render(
      <CalendarProvider timeZone={NEW_YORK}>
        <ProviderProbe
          direction="rtl"
          locale="fr-FR"
          messages={{ en: PROVIDER_TRANSLATIONS }}
          t={providerTranslateWithMiss}
        />
      </CalendarProvider>
    );

    expect(
      screen.getByText(
        "fr-FR|America/New_York|rtl|Grille du calendrier|provider:calendar.month.label"
      )
    ).toBeInTheDocument();
  });

  it("gives explicit component values precedence over provider values", () => {
    render(
      <CalendarProvider timeZone={NEW_YORK}>
        <CalendarLocalizationProvider
          direction="rtl"
          locale="fr-FR"
          t={providerTranslate}
        >
          <CalendarLocalizationProvider
            direction="ltr"
            locale="de-DE"
            t={explicitTranslate}
          >
            <CalendarProvider timeZone={TOKYO}>
              <Probe />
            </CalendarProvider>
          </CalendarLocalizationProvider>
        </CalendarLocalizationProvider>
      </CalendarProvider>
    );

    expect(
      screen.getByText(
        "de-DE|Asia/Tokyo|ltr|explicit:calendar.grid.label|explicit:calendar.month.label"
      )
    ).toBeInTheDocument();
  });

  it("interpolates values and picks the plural form from the count", () => {
    render(
      <CalendarLocalizationProvider
        messages={{
          en: { "calendar.month.eventCount_one": "{{count}} meeting" },
        }}
      >
        <PluralProbe />
      </CalendarLocalizationProvider>
    );

    expect(screen.getByText("1 meeting|2 events")).toBeInTheDocument();
  });

  it("isolates nested provider values while inheriting omitted fields", () => {
    render(
      <CalendarProvider timeZone={NEW_YORK}>
        <CalendarLocalizationProvider
          direction="rtl"
          locale="fr-FR"
          t={providerTranslate}
        >
          <Probe />
          <CalendarLocalizationProvider locale="de-DE" t={explicitTranslate}>
            <Probe />
          </CalendarLocalizationProvider>
          <Probe />
        </CalendarLocalizationProvider>
      </CalendarProvider>
    );

    expect(
      screen.getAllByText(
        "fr-FR|America/New_York|rtl|provider:calendar.grid.label|provider:calendar.month.label"
      )
    ).toHaveLength(2);
    expect(
      screen.getByText(
        "de-DE|America/New_York|rtl|explicit:calendar.grid.label|explicit:calendar.month.label"
      )
    ).toBeInTheDocument();
  });

  it("keeps a nested provider value stable for an unrelated parent change", () => {
    nestedChildRender.mockClear();
    const { rerender } = render(
      <CalendarLocalizationProvider
        messages={{ en: { "calendar.unrelated": "first" } }}
      >
        <CalendarLocalizationProvider
          direction="ltr"
          locale="de-DE"
          t={explicitTranslate}
        >
          <MemoizedChild />
        </CalendarLocalizationProvider>
      </CalendarLocalizationProvider>
    );

    expect(nestedChildRender).toHaveBeenCalledOnce();

    rerender(
      <CalendarLocalizationProvider
        messages={{ en: { "calendar.unrelated": "second" } }}
      >
        <CalendarLocalizationProvider
          direction="ltr"
          locale="de-DE"
          t={explicitTranslate}
        >
          <MemoizedChild />
        </CalendarLocalizationProvider>
      </CalendarLocalizationProvider>
    );

    expect(nestedChildRender).toHaveBeenCalledOnce();
  });

  it("falls back to built-in English for an untranslated key", () => {
    render(
      <CalendarLocalizationProvider t={identityTranslate}>
        <Probe />
      </CalendarLocalizationProvider>
    );

    expect(
      screen.getByText("en-US|UTC|ltr|Calendar grid|Month grid")
    ).toBeInTheDocument();
  });
});
