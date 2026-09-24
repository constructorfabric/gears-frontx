import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { allDayEvent, timedEvent, UTC } from "../../../__test-utils__/fixtures";
import type { CalendarEvent } from "../../../core/model";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import type { CalendarEventRenderer } from "../../../react/public";
import { AgendaView } from "../agenda-view";
import type { AgendaViewProps } from "../agenda-view";

type CalendarEventRenderContext = Parameters<CalendarEventRenderer>[0];

const NOW = utcInstant("2026-08-24T09:58:00.000Z");

const RENDERED_DAY_COUNT = 30;

const renderAgenda = (props: Partial<AgendaViewProps> = {}) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));

  const defaultProps: AgendaViewProps = {
    date: calendarDate("2026-08-24"),
    direction: "ltr",
    events: [],
    locale: "en-US",
    t,
    timeZone: UTC,
  };

  return render(<AgendaView {...defaultProps} {...props} />);
};

const requiredElement = <T extends Element>(element: T | null): T => {
  if (!element) {
    throw new Error("Expected agenda now line to render");
  }

  return element;
};

const dayGroupContaining = (label: string): HTMLElement =>
  requiredElement(screen.getByText(label, { exact: true }).closest("li"));

describe(AgendaView, () => {
  it("renders a native rolling list with localized day headers, counts, lanes, and hour gutters", () => {
    renderAgenda({
      events: [
        allDayEvent("all-day", "All-day event", "2026-08-24", "2026-08-25"),
        timedEvent(
          "current",
          "Current event",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:30:00.000Z",
          { attendees: 3, organizer: "Aylin Demir" }
        ),
        timedEvent(
          "tomorrow",
          "Tomorrow event",
          "2026-08-25T10:00:00.000Z",
          "2026-08-25T11:00:00.000Z"
        ),
      ],
    });

    screen.getByRole("region", { name: "Agenda view" });
    screen.getByRole("list");
    expect(screen.getAllByRole("listitem")).toHaveLength(RENDERED_DAY_COUNT);
    screen.getByText("Today");
    screen.getByText("Tomorrow");
    screen.getByText("Mon, Aug 24");
    screen.getByText("1 event");
    screen.getByText("2 events");
    const offsets = screen.getAllByTitle("UTC");
    const todayGroup = dayGroupContaining("Today");
    const tomorrowGroup = dayGroupContaining("Tomorrow");
    expect({
      allDayCount: screen.getAllByText("All day").length,
      facts: ["Aylin Demir", "3", "1 hr 30 min", "Now", "Starts in 1 day"].map(
        (text) => screen.getByText(text).textContent
      ),
      firstOffset: offsets[0]?.textContent,
      nineCount: screen.getAllByText("09:00").length,
      offsetCount: offsets.length,
      tenCount: screen.getAllByText("10:00").length,
      today: todayGroup.dataset.today,
      tomorrow: tomorrowGroup.dataset.today,
    }).toStrictEqual({
      allDayCount: 2,
      facts: ["Aylin Demir", "3", "1 hr 30 min", "Now", "Starts in 1 day"],
      firstOffset: "GMT+0",
      nineCount: 2,
      offsetCount: RENDERED_DAY_COUNT,
      tenCount: 3,
      today: "true",
      tomorrow: "false",
    });
  });

  it("does not render a timed empty state for an all-day-only day", () => {
    renderAgenda({
      events: [
        allDayEvent("all-day-only", "All-day only", "2026-08-25", "2026-08-26"),
      ],
    });

    const day = dayGroupContaining("All-day only");

    expect(within(day).getByText("1 event")).toBeVisible();
    expect(within(day).queryByText("No events")).toBeNull();
  });

  it("keeps one roving tab stop and activates the whole event slot", async () => {
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    renderAgenda({
      events: [
        timedEvent(
          "first",
          "First event",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:00:00.000Z"
        ),
        timedEvent(
          "second",
          "Second event",
          "2026-08-25T09:00:00.000Z",
          "2026-08-25T10:00:00.000Z"
        ),
      ],
      onEventSelect,
    });

    const slots = screen.getAllByRole("button");
    vi.useRealTimers();
    const user = userEvent.setup();

    expect({
      count: slots.length,
      initialTabIndexes: slots.map((slot) => slot.getAttribute("tabindex")),
    }).toStrictEqual({ count: 2, initialTabIndexes: ["0", "-1"] });

    slots[0]?.focus();
    await user.keyboard("{ArrowDown}");

    expect(slots.map((slot) => slot.getAttribute("tabindex"))).toStrictEqual([
      "-1",
      "0",
    ]);

    slots[1]?.focus();
    await user.keyboard("{Enter}");

    const [selectedEvent, context] = onEventSelect.mock.calls[0] ?? [];

    expect({
      calls: onEventSelect.mock.calls.length,
      contextEvent: context?.event.id,
      selectedEvent: selectedEvent?.id,
    }).toStrictEqual({
      calls: 1,
      contextEvent: "second",
      selectedEvent: "second",
    });
  });

  it("marks the selected row with the grids own selected treatment", () => {
    renderAgenda({
      events: [
        timedEvent(
          "first",
          "First event",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:00:00.000Z"
        ),
        timedEvent(
          "second",
          "Second event",
          "2026-08-24T11:00:00.000Z",
          "2026-08-24T12:00:00.000Z"
        ),
      ],
      selectedEventId: "second",
    });

    const [first, second] = screen.getAllByRole("button");

    expect(second.dataset.selected).toBe("true");
    expect(second.getAttribute("aria-pressed")).toBe("true");

    expect(first.dataset.selected).not.toBe("true");
    expect(first.getAttribute("aria-pressed")).not.toBe("true");
  });

  it("activates from a pointer click as well as the keyboard", async () => {
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    renderAgenda({
      events: [
        timedEvent(
          "first",
          "First event",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:00:00.000Z"
        ),
      ],
      onEventSelect,
    });

    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));

    const [selectedEvent, context] = onEventSelect.mock.calls[0] ?? [];

    expect(selectedEvent?.id).toBe("first");
    expect(context?.event.id).toBe("first");
  });

  it("announces the range and every day count through one live region", () => {
    renderAgenda({
      events: [
        timedEvent(
          "one",
          "One",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:00:00.000Z"
        ),
      ],
    });

    const liveRegion = screen.getByRole("status");

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    expect(liveRegion).toHaveTextContent("Aug 24");
    expect(liveRegion).toHaveTextContent("1 event");
    expect(liveRegion).toHaveTextContent("0 events");
  });

  it("renders ordinary rolling rows for empty events with no status regions", () => {
    renderAgenda({ events: [] });

    const agenda = screen.getByRole("region", { name: "Agenda view" });
    const today = dayGroupContaining("Today");
    const emptyDays = within(screen.getByRole("list"))
      .getAllByText("No events")
      .filter((emptyDay) => !today.contains(emptyDay));

    expect({
      busy: agenda.hasAttribute("aria-busy"),
      emptyDayCount: emptyDays.length,
      loading: screen.queryByRole("status", { name: "Loading agenda…" }),
      nowLabel: screen.getByText("09:58").textContent,
      todayGutter: within(today).getByText("09:00").textContent,
      todayHasEmptyLabel: within(today).queryByText("No events") !== null,
    }).toStrictEqual({
      busy: false,
      emptyDayCount: RENDERED_DAY_COUNT - 1,
      loading: null,
      nowLabel: "09:58",
      todayGutter: "09:00",
      todayHasEmptyLabel: true,
    });
  });

  it("anchors the now line to the real hour when it falls outside the event span", () => {
    renderAgenda({
      events: [
        timedEvent(
          "later",
          "Later",
          "2026-08-24T13:00:00.000Z",
          "2026-08-24T14:00:00.000Z"
        ),
      ],
    });

    const today = dayGroupContaining("Today");

    expect(within(today).getByText("09:00")).toBeVisible();
    expect(within(today).getAllByText("13:00")).not.toHaveLength(0);

    expect(document.querySelector("[data-current-time]")).toBeVisible();
    expect(within(today).getByText("09:00")).toBeVisible();
  });

  it("draws the current time line only in the displayed current-day group", () => {
    const { rerender } = renderAgenda({
      events: [
        timedEvent(
          "current",
          "Current",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:00:00.000Z"
        ),
      ],
    });

    const nowLine = requiredElement(
      document.querySelector("[data-current-time]")
    );
    expect(nowLine.getAttribute("aria-hidden")).toBe("true");
    expect(nowLine.textContent).toContain("09:58");

    rerender(
      <AgendaView
        date={calendarDate("2026-09-24")}
        events={[]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
      />
    );

    expect(screen.queryByText("09:58", { exact: true })).toBeNull();
  });

  it("renders the ordinary agenda with no alert region", () => {
    renderAgenda({ events: [] });

    expect(
      screen.getByRole("region", { name: "Agenda view" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses the viewer locale, zone, and explicit RTL direction", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    render(
      <div dir="rtl">
        <AgendaView
          date={calendarDate("2026-08-24")}
          events={[
            timedEvent(
              "localized",
              "Localized event",
              "2026-08-24T09:00:00.000Z",
              "2026-08-24T10:30:00.000Z",
              { organizer: "Marie" }
            ),
          ]}
          timeZone={parseIanaTimeZone("Europe/Berlin")}
          locale="de-DE"
          t={t}
          direction="rtl"
        />
      </div>
    );

    const agenda = screen.getByRole("region", { name: "Agenda view" });
    const eventButton = screen.getByRole("button", {
      name: /Localized event/u,
    });
    expect({
      date: screen.getAllByText(/Mo\., Aug 24/u)[0]?.textContent,
      direction: agenda.getAttribute("dir"),
      endCount: screen.getAllByText("12:30").length,
      eventTimes: [
        within(eventButton).getByText("11:00").textContent,
        within(eventButton).getByText("12:30").textContent,
      ],
      startCount: screen.getAllByText("11:00").length,
      zoneCount: screen.getAllByText("GMT+2").length,
    }).toStrictEqual({
      date: "Mo., Aug 24",
      direction: null,
      endCount: 1,
      eventTimes: ["11:00", "12:30"],
      startCount: 2,
      zoneCount: RENDERED_DAY_COUNT,
    });
  });

  it("renders agenda events across access and colour variants", () => {
    const event = {
      access: "busy" as const,
      allDay: false as const,
      attendees: [],
      colorFamily: "purple" as const,
      end: utcInstant("2026-08-26T01:00:00.000Z"),
      endDate: calendarDate("2026-08-26"),
      endTime: parseLocalTime("01:00"),
      id: "variant",
      start: utcInstant("2026-08-24T23:00:00.000Z"),
      startDate: calendarDate("2026-08-24"),
      startTime: parseLocalTime("23:00"),
      timeZone: UTC,
      title: "Variant",
    };

    const unknownColor = {
      ...event,
      colorFamily: "unknown" as const,
      id: "unknown",
    };

    renderAgenda({ events: [event, unknownColor] });

    expect(screen.getAllByText("Variant").length).toBeGreaterThanOrEqual(2);
  });
});
