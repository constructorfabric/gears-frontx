import { render, screen } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";

import { providerTranslate } from "../../__test-utils__/fixtures";
import { parseIanaTimeZone } from "../../core/model";
import type { IanaTimeZone } from "../../core/model";
import * as CalendarKit from "../../index";
import {
  CalendarLocalizationProvider,
  CalendarProvider,
  getLocaleDirection,
  useCalendarContext,
  useCalendarLocalization,
} from "../public";
import type {
  CalendarLocalizationValue,
  CalendarTranslate,
  CalendarViewerValue,
} from "../public";

const NEW_YORK = parseIanaTimeZone("America/New_York");

const HookProbe = () => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  return (
    <output>
      {locale}|{timeZone}|{direction}|{t("calendar.grid.label")}
    </output>
  );
};

describe("public calendar hooks", () => {
  it("resolves built-in defaults without a provider", () => {
    render(<HookProbe />);

    expect(screen.getByText("en-US|UTC|ltr|Calendar grid")).toBeInTheDocument();
  });

  it("matches the focused hook contracts", () => {
    expectTypeOf<CalendarLocalizationValue>().toExtend<{
      readonly locale: string;
      readonly direction: "ltr" | "rtl";
      readonly t: CalendarTranslate;
    }>();
    expectTypeOf<CalendarViewerValue>().toExtend<{
      readonly timeZone: IanaTimeZone;
    }>();
    expectTypeOf<
      CalendarLocalizationValue["t"]
    >().toEqualTypeOf<CalendarTranslate>();
  });

  it("resolves provider localization and translation values", () => {
    render(
      <CalendarProvider timeZone={NEW_YORK}>
        <CalendarLocalizationProvider
          direction="rtl"
          locale="fr-FR"
          t={providerTranslate}
        >
          <HookProbe />
        </CalendarLocalizationProvider>
      </CalendarProvider>
    );

    expect(
      screen.getByText(
        "fr-FR|America/New_York|rtl|provider:calendar.grid.label"
      )
    ).toBeInTheDocument();
  });

  it("derives the direction from the locale until it is set", () => {
    expect(getLocaleDirection("ar-EG")).toBe("rtl");
    expect(getLocaleDirection("he")).toBe("rtl");
    expect(getLocaleDirection("pt-BR")).toBe("ltr");
    expect(getLocaleDirection("not a locale")).toBe("ltr");

    render(
      <CalendarLocalizationProvider locale="he">
        <HookProbe />
      </CalendarLocalizationProvider>
    );

    expect(screen.getByText("he|UTC|rtl|Calendar grid")).toBeInTheDocument();
  });

  it("reads the script where the runtime has no text info", () => {
    const prototype = Reflect.getPrototypeOf(new Intl.Locale("en"));

    if (prototype === null) {
      throw new Error("Intl.Locale has no prototype");
    }

    const getTextInfo = Object.getOwnPropertyDescriptor(
      prototype,
      "getTextInfo"
    );
    const textInfo = Object.getOwnPropertyDescriptor(prototype, "textInfo");

    Reflect.deleteProperty(prototype, "getTextInfo");
    Reflect.deleteProperty(prototype, "textInfo");

    try {
      expect("getTextInfo" in prototype).toBeFalsy();
      expect("textInfo" in prototype).toBeFalsy();
      expect(getLocaleDirection("ar-EG")).toBe("rtl");
      expect(getLocaleDirection("he")).toBe("rtl");
      expect(getLocaleDirection("pt-BR")).toBe("ltr");
    } finally {
      if (getTextInfo !== undefined) {
        Object.defineProperty(prototype, "getTextInfo", getTextInfo);
      }
      if (textInfo !== undefined) {
        Object.defineProperty(prototype, "textInfo", textInfo);
      }
    }
  });

  it("exposes the viewer zone and the localization separately", () => {
    expect("useCalendarContext" in CalendarKit).toBeTruthy();
    expect("useCalendarLocalization" in CalendarKit).toBeTruthy();
    expect("useCalendarTranslation" in CalendarKit).toBeFalsy();
  });
});
