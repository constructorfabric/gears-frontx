import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarEvent } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

const DATE = calendarDate("2026-08-24");
const BERLIN = parseIanaTimeZone("Europe/Berlin");
const SOFIA = parseIanaTimeZone("Europe/Sofia");

const viewerZoneEvent: CalendarEvent = {
  allDay: false,
  colorFamily: "purple",
  end: utcInstant("2026-08-24T08:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id: "viewer-zone-event",
  start: utcInstant("2026-08-24T07:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: BERLIN,
  title: "Viewer zone event",
};

const renderWeek = (overrides: Partial<WeekGridProps> = {}): void => {
  render(
    <WeekGrid
      date={DATE}
      events={[]}
      timeZone={SOFIA}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );
};

describe("WeekGrid time display", () => {
  it("formats timed cards in the viewer zone used for their placement", () => {
    renderWeek({ events: [viewerZoneEvent] });

    const card = screen.getByRole("button", { name: /Viewer zone event/u });

    assert(card.textContent).toContain("10:00 – 11:00");
    assert(card.textContent).not.toContain("09:00 – 10:00");
  });

  it("renders the current viewer time visibly on the now line", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T06:58:00.000Z"));
    renderWeek();

    const nowLine = screen.getByRole("status", { name: "Current time: 09:58" });

    assert(nowLine).toBeVisible();
    assert(nowLine.textContent).toContain("09:58");
  });
});
