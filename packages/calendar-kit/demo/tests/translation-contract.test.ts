import { beforeAll, describe, expect, it, vi } from "vitest";

import { ENGLISH_TRANSLATIONS } from "../../src/i18n/english";
import type * as DemoMain from "../main";

vi.mock("@gears-frontx/calendar-kit", () => ({
  CalendarLocalizationProvider: () => null,
  CalendarProvider: () => null,
  calendarDate: (value: string) => value,
  fromViewerDateTime: ({ date, time }: { date: string; time: string }) =>
    `${date}T${time}`,
  parseIanaTimeZone: (value: string) => value,
  parseLocalTime: (value: string) => value,
  utcInstant: (value: Date) => value,
}));

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: () => {} }),
}));

let demoModule: typeof DemoMain;

/** The kit's placeholder shape. One left standing means a value the demo never passed. */
const UNRESOLVED = /\{\{\w+\}\}/u;

/** Values covering every placeholder the demo's own strings use. */
const VALUES: Readonly<Record<string, string | number>> = {
  count: 2,
  day: 23,
  interval: 2,
  weekdays: "Monday",
};

const unknownIds = (keys: readonly string[]): readonly string[] =>
  keys.filter((key) => ENGLISH_TRANSLATIONS[key] === undefined);

describe("demo translation table", () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="root"></div>';
    demoModule = await import("../main");
  });

  it("keeps every key a real kit id", () => {
    expect(unknownIds(Object.keys(demoModule.DEMO_STRINGS))).toStrictEqual([]);
    expect(
      unknownIds(Object.keys(demoModule.DEMO_WEEK_TRANSLATIONS))
    ).toStrictEqual([]);
  });

  it("renders every entry without leaving a placeholder behind", () => {
    const rendered = Object.entries(demoModule.DEMO_STRINGS).map(
      ([key, text]) =>
        [key, demoModule.demoTranslate(key, VALUES), text] as const
    );

    // A key that renders as itself means the demo's table never served it.
    expect(rendered.filter(([key, text]) => text === key)).toStrictEqual([]);
    expect(rendered.filter(([, text]) => UNRESOLVED.test(text))).toStrictEqual(
      []
    );
  });

  it("picks the plural form from the count", () => {
    expect(
      demoModule.demoTranslate("calendar.detail.rsvp.yes", { count: 2 })
    ).toBe("2 accepted");
    expect(
      demoModule.demoTranslate("calendar.detail.rsvp.no", { count: 1 })
    ).toBe("1 declined");
  });

  it("returns the id instead of throwing for unknown ids", () => {
    expect(demoModule.demoTranslate("calendar.demo.missing")).toBe(
      "calendar.demo.missing"
    );
    expect(demoModule.demoTranslate("monday")).toBe("monday");
    expect(demoModule.demoTranslate("time_zone")).toBe("time_zone");
  });
});
