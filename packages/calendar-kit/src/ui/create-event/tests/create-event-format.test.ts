import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type { TimedCreateEventDraft } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import {
  REPEAT_PRESET,
  REPEAT_UNIT,
  WEEKDAY_ORDER,
  createDefaultAnchorRect,
  firstLetter,
  formatDateRowLabel,
  formatRepeatHint,
  formatRepeatSummary,
  formatTimeZone,
  initials,
  resolveOverlayKind,
  serializeCustomRepeat,
  weekdayLabel,
} from "../create-event-format";
import { CreateEventPopover } from "../create-event-popover";

const DATE = calendarDate("2026-08-24");

const draft: TimedCreateEventDraft = {
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
};

const popoverProps = () => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [],
  defaultDraft: draft,
  defaultOpen: true,
  direction: "ltr" as const,
  locale: "en-US",
  locations: [
    { id: "room-1", label: "Science Hall 204" },
    { id: "room-2", label: "Virtual room" },
  ],
  onCancel: () => {},
  onSubmit: (): undefined => undefined,
  people: [],
  t,
  timeZone: UTC,
});

const repeatState = (unit: "day" | "week" | "month", interval = 1) => ({
  byDay: [...WEEKDAY_ORDER],
  endDate: null,
  endKind: "never" as const,
  interval,
  unit,
});

describe("create-event-format", () => {
  it("serializes custom repeat units, intervals, and weekday ordering", () => {
    assert(
      serializeCustomRepeat({
        byDay: ["wednesday", "monday"],
        endDate: null,
        endKind: "never",
        interval: 1,
        unit: REPEAT_UNIT.week,
      })
    ).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
    assert(serializeCustomRepeat(repeatState(REPEAT_UNIT.day, 2))).toBe(
      "FREQ=DAILY;INTERVAL=2"
    );
    assert(serializeCustomRepeat(repeatState(REPEAT_UNIT.month, 2.8))).toBe(
      "FREQ=MONTHLY;INTERVAL=2"
    );
    assert(
      serializeCustomRepeat({
        byDay: [],
        endDate: null,
        endKind: "never",
        interval: 0,
        unit: REPEAT_UNIT.week,
      })
    ).toBe("FREQ=WEEKLY");
  });

  it("formats recurrence summaries for supported and malformed values", () => {
    assert(formatRepeatSummary(null, t, "en-US")).toBeUndefined();
    assert(formatRepeatSummary("FREQ=DAILY", t, "en-US")).toBe("Daily");
    assert(formatRepeatSummary("FREQ=MONTHLY", t, "en-US")).toBe("Monthly");
    assert(formatRepeatSummary("FREQ=YEARLY", t, "en-US")).toBe("Yearly");
    assert(formatRepeatSummary("FREQ=WEEKLY;BYDAY=MO", t, "en-US")).toBe(
      "Weekly: Monday"
    );
    assert(formatRepeatSummary("FREQ=WEEKLY;BYDAY=XX", t, "en-US")).toBe(
      "Weekly"
    );
    assert(formatRepeatSummary("FREQ=WEEKLY;BYDAY=MO,WE", t, "fr-FR")).toBe(
      "Weekly: Monday et Wednesday"
    );
  });

  it("formats a deterministic time-zone offset from the injected instant", () => {
    assert(
      formatTimeZone(
        "America/New_York",
        "en-US",
        t,
        utcInstant("2026-01-15T12:00:00.000Z")
      )
    ).toContain("EST");
    assert(
      formatTimeZone(
        "America/New_York",
        "en-US",
        t,
        utcInstant("2026-07-15T12:00:00.000Z")
      )
    ).toContain("EDT");
  });

  it("formats dates, zones, names, and weekday labels without app dependencies", () => {
    const date = calendarDate("2026-08-24");

    assert(formatDateRowLabel(date, "en-US")).toContain("24");
    assert(formatDateRowLabel(date, "en-US", true)).toContain("2026");
    assert(formatTimeZone("UTC", "en-US")).toContain("UTC");
    assert(initials("Ada Lovelace")).toBe("AL");
    assert(initials("  ada  ")).toBe("A");
    assert(firstLetter(" constructor ")).toBe("C");
    assert(firstLetter(" ")).toBe("");
    assert(weekdayLabel("monday", t)).toBe("Monday");
    assert(createDefaultAnchorRect().width).toBe(0);
  });

  it("resolves nested overlay precedence", () => {
    assert(resolveOverlayKind(false, true)).toBe("custom-repeat");
    assert(resolveOverlayKind(true, true)).toBe("discard");
    assert(resolveOverlayKind(false, false)).toBe("none");
    assert(REPEAT_PRESET.none).toBe("none");
  });

  it("guards malformed browser field values and dispatches clicked repeat units", () => {
    render(createElement(CreateEventPopover, popoverProps()));

    const startDate = screen.getByLabelText("Start date");
    Object.defineProperty(startDate, "value", {
      configurable: true,
      get: () => "not-a-date",
      set: () => {},
    });
    fireEvent.change(startDate);

    const startTime = screen.getByLabelText("Start time");
    Object.defineProperty(startTime, "value", {
      configurable: true,
      get: () => "25:00",
      set: () => {},
    });
    fireEvent.change(startTime);

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    act(() => {
      fireEvent.change(repeat, { target: { value: "custom" } });
    });
    const repeatDialog = screen.getByRole("dialog", {
      name: /custom|repeat/iu,
    });
    const unit = within(repeatDialog).getByRole("combobox", {
      name: "every 1 week(s)",
    });
    act(() => {
      fireEvent.click(unit);
    });
    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "day(s)" }));
    });

    assert(repeatDialog).toBeInTheDocument();
  });

  it("covers custom repeat unit branches and location input updates", async () => {
    const user = userEvent.setup();
    render(createElement(CreateEventPopover, popoverProps()));

    const repeat = screen.getByLabelText(/repeat/iu);
    act(() => {
      fireEvent.change(repeat, { target: { value: "custom" } });
    });

    const repeatDialog = screen.getByRole("dialog", {
      name: /custom|repeat/iu,
    });
    const unit = within(repeatDialog).getByLabelText("every 1 week(s)");
    act(() => {
      fireEvent.change(unit, { target: { value: "day" } });
    });
    act(() => {
      fireEvent.change(unit, { target: { value: "month" } });
    });
    act(() => {
      fireEvent.change(unit, { target: { value: "week" } });
    });
    await user.click(
      within(repeatDialog).getByRole("button", { name: /back/iu })
    );

    assert(screen.queryByRole("combobox", { name: /location/iu })).toBeNull();

    const addLocation = screen.getByRole("button", { name: /location/iu });
    await user.click(addLocation);

    const location = screen.getByLabelText(/location/iu);
    fireEvent.change(location, { target: { value: "Science Hall 204" } });

    assert(location).toHaveValue("Science Hall 204");
  });
});

const hintMessage = (
  id: string,
  values?: Readonly<Record<string, string | number>>,
  count?: number
): string => t(id, count === undefined ? values : { ...values, count });

// 2026-09-23 is a Wednesday.
const hint = (rule: string): string | undefined =>
  formatRepeatHint(rule, calendarDate("2026-09-23"), hintMessage, "en-US");

describe(formatRepeatHint, () => {
  it("spells out the interval, the weekdays, and the end date", () => {
    assert(hint("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20260930")).toBe(
      "Repeats every 2 weeks on Monday and Wednesday until Wed, Sep 30, 2026"
    );
  });

  it("uses the singular sentence for an interval of one", () => {
    assert(hint("FREQ=WEEKLY;BYDAY=FR")).toBe("Repeats every week on Friday");
    assert(hint("FREQ=DAILY")).toBe("Repeats every day");
    assert(hint("FREQ=MONTHLY;INTERVAL=3")).toBe(
      "Repeats every 3 months on day 23"
    );
  });

  it("describes presets from the start date", () => {
    assert(hint("FREQ=WEEKLY")).toBe("Repeats every week on Wednesday");
    assert(hint("FREQ=WEEKLY;INTERVAL=2")).toBe(
      "Repeats every 2 weeks on Wednesday"
    );
    assert(hint("FREQ=MONTHLY")).toBe("Repeats every month on day 23");
  });

  it("says nothing without a rule", () => {
    assert(hint("")).toBeUndefined();
  });
});
