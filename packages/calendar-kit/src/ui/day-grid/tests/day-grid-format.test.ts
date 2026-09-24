import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import type { ReactNode } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { formatGridTime } from "../../../core/format";
import { calendarDate, utcInstant } from "../../../core/model";
import type {
  CalendarEvent,
  CalendarEventRenderContext,
} from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { englishTranslate } from "../../../i18n/english";
import { DayGrid } from "../day-grid";
import { buildEventAnnouncement } from "../day-grid-format";

const t: CalendarTranslate = (key, values) =>
  key === "all_day" ? "all day" : englishTranslate(key, values);

describe("day-grid-format", () => {
  it("formats a viewer time with the supplied locale and zone", () => {
    assert(
      formatGridTime(utcInstant("2026-08-24T09:00:00.000Z"), UTC, "en-US")
    ).toBe("09:00");
  });

  it("announces timed and all-day segments using consumer translations", () => {
    const timed = timedEvent({ id: "timed" });

    const timedSegment = {
      date: calendarDate("2026-08-24"),
      end: timed.end,
      event: timed,
      segment: null,
      start: timed.start,
    };

    assert(buildEventAnnouncement(timedSegment, UTC, "en-US", t)).toBe(
      "Event Planning. 09:00 to 10:00"
    );

    const allDay: Extract<CalendarEvent, { readonly allDay: true }> = {
      allDay: true,
      colorFamily: "turquoise",
      endDate: calendarDate("2026-08-25"),
      endTime: null,
      id: "all-day",
      startDate: calendarDate("2026-08-24"),
      startTime: null,
      timeZone: UTC,
      title: "Planning",
    };

    assert(
      buildEventAnnouncement(
        {
          date: calendarDate("2026-08-24"),
          end: timed.end,
          event: allDay,
          segment: null,
          start: timed.start,
        },
        UTC,
        "en-US",
        t
      )
    ).toBe("Event Planning. All day");
  });

  it("keeps host event rendering and focus announcements on the EventCard surface", async () => {
    const user = userEvent.setup();
    const renderEvent = vi.fn<
      (context: CalendarEventRenderContext) => ReactNode
    >((context: CalendarEventRenderContext) => context.event.title);

    const event: Extract<CalendarEvent, { readonly allDay: true }> = {
      allDay: true,
      colorFamily: "turquoise",
      endDate: calendarDate("2026-08-25"),
      endTime: null,
      id: "all-day",
      startDate: calendarDate("2026-08-24"),
      startTime: null,
      timeZone: UTC,
      title: "Planning",
    };

    const timed = { ...timedEvent({ id: "timed" }), title: "Timed Planning" };

    render(
      createElement(DayGrid, {
        date: calendarDate("2026-08-24"),
        direction: "ltr",
        events: [event, timed],
        locale: "en-US",
        renderEvent,
        t,
        timeZone: UTC,
      })
    );

    const eventButton = screen.getByRole("button", { name: "Planning" });

    await user.click(eventButton);

    assert(renderEvent).toHaveBeenCalledWith(assert.anything());

    const timedButton = screen.getByRole("button", { name: /Timed Planning/u });
    await user.click(timedButton);

    assert(renderEvent).toHaveBeenCalledWith(assert.anything());
  });

  it("renders the plain grid without loading, error, or empty state UI", () => {
    render(
      createElement(DayGrid, {
        date: calendarDate("2026-08-24"),
        direction: "ltr",
        events: [],
        locale: "en-US",
        t,
        timeZone: UTC,
      })
    );

    assert(screen.getByRole("grid")).toBeVisible();
    assert(screen.queryByRole("alert")).toBeNull();
    assert(screen.getByRole("status")).toBeVisible();
  });
});
