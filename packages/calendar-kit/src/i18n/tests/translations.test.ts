import { describe, expect, it } from "vitest";

import { numberFormatter } from "../../core/intl-cache";
import {
  ENGLISH_LOCALE,
  isUsableTranslation,
  localeChain,
  pluralCandidates,
  readTranslation,
} from "../translations";

describe("translation lookup", () => {
  it("counts in the catalogue's language, not the requested one", () => {
    const catalogue = { a_one: "{{count}} item", a_other: "{{count}} items" };

    expect(readTranslation(catalogue, "a", { count: 0 }, "fr")).toBe("0 item");
    expect(readTranslation(catalogue, "a", { count: 0 }, "fr", "en")).toBe(
      "0 items"
    );
  });

  it("canonicalises the locale and steps through its script", () => {
    expect(localeChain("pt_BR")).toStrictEqual(["pt-BR", "pt", ENGLISH_LOCALE]);
    expect(localeChain("pt-br")).toStrictEqual(["pt-BR", "pt", ENGLISH_LOCALE]);
    expect(localeChain("zh-Hant-TW")).toStrictEqual([
      "zh-Hant-TW",
      "zh-Hant",
      "zh",
      ENGLISH_LOCALE,
    ]);
  });

  it("walks a locale down to its language and to English", () => {
    expect(localeChain("pt-BR")).toStrictEqual(["pt-BR", "pt", ENGLISH_LOCALE]);
    expect(localeChain("de")).toStrictEqual(["de", ENGLISH_LOCALE]);
    expect(localeChain("en-US")).toStrictEqual(["en-US", ENGLISH_LOCALE]);
    expect(localeChain(ENGLISH_LOCALE)).toStrictEqual([ENGLISH_LOCALE]);
  });

  it("selects the plural form from the count, then `_other`, then the id", () => {
    expect(
      pluralCandidates("calendar.month.eventCount", undefined, "en-US")
    ).toStrictEqual(["calendar.month.eventCount"]);
    expect(
      pluralCandidates("calendar.month.eventCount", 1, "en-US")
    ).toStrictEqual([
      "calendar.month.eventCount_one",
      "calendar.month.eventCount_other",
      "calendar.month.eventCount",
    ]);
    expect(
      pluralCandidates("calendar.month.eventCount", 4, "en-US")
    ).toStrictEqual([
      "calendar.month.eventCount_other",
      "calendar.month.eventCount",
    ]);
  });

  it("treats a missing, empty or self-referencing value as a miss", () => {
    expect(isUsableTranslation(undefined, "a")).toBeFalsy();
    expect(isUsableTranslation("", "a")).toBeFalsy();
    expect(isUsableTranslation("a", "a")).toBeFalsy();
    expect(isUsableTranslation("b", "a")).toBeTruthy();
  });

  it("reads the plural form of the count it is given", () => {
    const translations = {
      "calendar.month.eventCount_one": "{{count}} event",
      "calendar.month.eventCount_other": "{{count}} events",
    };

    expect(
      readTranslation(
        translations,
        "calendar.month.eventCount",
        { count: 1 },
        "en-US"
      )
    ).toBe("1 event");
    expect(
      readTranslation(
        translations,
        "calendar.month.eventCount",
        { count: 3 },
        "en-US"
      )
    ).toBe("3 events");
  });

  it("falls back to `_other` when a locale has no form for the count", () => {
    const translations = {
      "calendar.month.eventCount_other": "{{count}} events",
    };

    expect(
      readTranslation(
        translations,
        "calendar.month.eventCount",
        { count: 1 },
        "en-US"
      )
    ).toBe("1 events");
  });

  it("reads a count-free id when one is asked for", () => {
    const translations = {
      "calendar.toolbar.label": "Calendar toolbar",
      "calendar.toolbar.label_other": "Ignored",
    };

    expect(
      readTranslation(
        translations,
        "calendar.toolbar.label",
        undefined,
        "en-US"
      )
    ).toBe("Calendar toolbar");
  });

  it("formats numbers for the locale and leaves other values alone", () => {
    const translations = { "calendar.agenda.range": "{{start}} to {{end}}" };

    expect(
      readTranslation(
        translations,
        "calendar.agenda.range",
        { end: "Friday", start: 1234 },
        "en-US"
      )
    ).toBe(`${numberFormatter("en-US").format(1234)} to Friday`);
  });

  it("leaves an unfilled placeholder in place", () => {
    expect(
      readTranslation({ a: "{{missing}} left" }, "a", { count: 1 }, "en-US")
    ).toBe("{{missing}} left");
  });
});
