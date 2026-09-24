import { describe, expect as assert, it } from "vitest";

import { DATE_INPUT, parseDateInput } from "../date-text";
import type { DateInputResult } from "../date-text";
import { calendarDate } from "../model";

describe("calendar date-text parsing", () => {
  const REFERENCE_DATE = calendarDate("2026-08-24");

  const parse = (text: string, locale = "en-US"): DateInputResult =>
    parseDateInput(text, { locale, reference: REFERENCE_DATE });

  it("reports empty input for blank text", () => {
    assert(parse("")).toStrictEqual({ kind: DATE_INPUT.empty });
    assert(parse("   ")).toStrictEqual({ kind: DATE_INPUT.empty });
  });

  it("accepts an ISO date in any locale", () => {
    assert(parse("2026-09-22")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("2026-09-22", "de-DE")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("reads numeric input in the order the locale writes it", () => {
    assert(parse("9/22/2026")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("22.9.2026", "de-DE")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("22/9/2026", "en-GB")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("fills the missing parts from the reference date", () => {
    assert(parse("22")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-08-22",
    });
    assert(parse("9/22")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("22/9", "en-GB")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("expands a two-digit year into the current century", () => {
    assert(parse("9/22/26")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("reads month names in the display format it renders", () => {
    assert(parse("Tue, Sep 22")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("September 22, 2027")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2027-09-22",
    });
    assert(parse("22. Sept. 2026", "de-DE")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("normalises localized digits", () => {
    assert(parse("٢٠٢٦-٠٩-٢٢", "ar-EG")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("rejects impossible and unreadable dates", () => {
    assert(parse("Feb 30")).toStrictEqual({ kind: DATE_INPUT.invalid });
    assert(parse("13/40/2026")).toStrictEqual({ kind: DATE_INPUT.invalid });
    assert(parse("hello")).toStrictEqual({ kind: DATE_INPUT.invalid });
    assert(parse("0/0/0")).toStrictEqual({ kind: DATE_INPUT.invalid });
  });
});
