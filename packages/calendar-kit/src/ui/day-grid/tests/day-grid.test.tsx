import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect as assert, it, vi } from "vitest";

import {
  timedEvent as fixtureTimedEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import type {
  CalendarColorFamily,
  CalendarDirection,
  CalendarEvent,
  CalendarEventRenderContext,
} from "../../../core/model";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import type { CalendarQuickCreatePayload } from "../../../react/slots";
import { DayGrid } from "../day-grid";

const requiredPayload = (
  value: CalendarQuickCreatePayload | undefined
): CalendarQuickCreatePayload => {
  if (!value) {
    throw new Error("Expected quick-create to emit a payload");
  }

  return value;
};

const requiredElement = <T extends Element>(element: T | null): T => {
  if (!element) {
    throw new Error("Expected calendar element to render");
  }

  return element;
};

const BASE_DIRECTION: CalendarDirection = "ltr";

const BASE_PROPS = {
  date: calendarDate("2026-08-24"),
  direction: BASE_DIRECTION,
  locale: "en-US",
  t,
  timeZone: UTC,
};

const event = (
  id: string,
  title: string,
  start: string,
  end: string,
  options: {
    allDay?: boolean;
    colorFamily?: CalendarColorFamily;
  } = {}
): CalendarEvent => {
  const { allDay = false, ...eventOptions } = options;

  const common = {
    attendees: [],
    calendarId: null,
    colorFamily: eventOptions.colorFamily ?? "turquoise",
    conferencingProviderId: null,
    description: "",
    id,
    location: null,
    recurrenceRule: null,
    timeZone: UTC,
    title,
  };

  if (allDay) {
    return {
      ...common,
      allDay: true,
      endDate: calendarDate(end.slice(0, 10)),
      endTime: null,
      startDate: calendarDate(start.slice(0, 10)),
      startTime: null,
    };
  }

  return fixtureTimedEvent({
    attendees: common.attendees,
    calendarId: common.calendarId,
    colorFamily: common.colorFamily,
    conferencingProviderId: common.conferencingProviderId,
    description: common.description,
    end: utcInstant(end),
    endDate: calendarDate(end.slice(0, 10)),
    endTime: parseLocalTime(end.slice(11, 16)),
    id,
    location: common.location,
    recurrenceRule: common.recurrenceRule,
    start: utcInstant(start),
    startDate: calendarDate(start.slice(0, 10)),
    startTime: parseLocalTime(start.slice(11, 16)),
    timeZone: common.timeZone,
    title,
  });
};

describe(DayGrid, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the ordinary empty grid with the timed layout", () => {
    render(<DayGrid {...BASE_PROPS} events={[]} />);

    assert(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("renders a keyboard-navigable 24-hour grid with timezone gutter label", () => {
    render(<DayGrid {...BASE_PROPS} events={[]} />);

    screen.getByRole("grid", { name: /August 24, 2026.*UTC/iu });
    screen.getByText(/^GMT/u);
    assert(screen.getByText(/^GMT/u)).toHaveAttribute("title", "UTC");
    assert(screen.getAllByRole("gridcell")).toHaveLength(24);

    assert(
      screen
        .getByRole("gridcell", { name: /08:00.*working hour/iu })
        .getAttribute("tabindex")
    ).toBe("0");
  });

  it("keeps the cell label in the accessibility tree without rendering it as visible text", () => {
    render(<DayGrid {...BASE_PROPS} events={[]} />);

    const cell = screen.getByRole("gridcell", {
      name: /09:00.*working hour/iu,
    });

    assert(cell).toHaveAttribute(
      "aria-label",
      assert.stringMatching(/09:00.*working hour/iu)
    );
    assert(cell.textContent).toBe("");
    assert(screen.queryByText(/working hour/iu)).toBeNull();
  });

  it("heads the day column with the weekday and day number, flagged when it is today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T09:00:00.000Z"));

    const { rerender } = render(<DayGrid {...BASE_PROPS} events={[]} />);

    screen.getByText("Mon");
    screen.getByText("24");

    assert(screen.getByText("Mon").className).toContain("today");
    assert(screen.getByText("24").className).toContain("today");

    rerender(
      <DayGrid {...BASE_PROPS} date={calendarDate("2026-08-25")} events={[]} />
    );

    assert(screen.getByText("Tue").className).not.toContain("today");
    assert(screen.getByText("25").className).not.toContain("today");
  });

  it("renders the ordinary grid when no event intersects the displayed day", () => {
    render(
      <DayGrid
        {...BASE_PROPS}
        events={[
          event(
            "other-day",
            "Other day",
            "2026-08-25T09:00:00.000Z",
            "2026-08-25T10:00:00.000Z"
          ),
        ]}
      />
    );

    assert(screen.getByRole("grid")).toBeInTheDocument();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("positions timed events from temporal instants and lays overlaps side by side", () => {
    render(
      <DayGrid
        {...BASE_PROPS}
        events={[
          event(
            "chemistry",
            "Introduction to Chemistry",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
          event(
            "overlap-a",
            "Overlap A",
            "2026-08-24T09:30:00.000Z",
            "2026-08-24T10:30:00.000Z"
          ),
        ]}
      />
    );

    const first = screen.getByRole("button", {
      name: /Introduction to Chemistry/iu,
    });
    const second = screen.getByRole("button", { name: /Overlap A/iu });

    assert(first).toHaveAttribute("data-event-id", "chemistry");

    const firstFrame = requiredElement(
      first.closest<HTMLElement>('[class*="timedEvent"]')
    );
    const secondFrame = requiredElement(
      second.closest<HTMLElement>('[class*="timedEvent"]')
    );

    assert(firstFrame.getAttribute("style")).toContain(
      "inset-inline-start: 0%"
    );
    assert(secondFrame.getAttribute("style")).toContain(
      "inset-inline-start: 49%"
    );

    assert(firstFrame.getAttribute("style")).toContain(
      "inline-size: calc(49% - var(--calendar-event-inset))"
    );
  });

  it("keeps timed events and the now line under the same positioned containing block", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T13:30:00.000Z"));

    render(
      <DayGrid
        {...BASE_PROPS}
        events={[
          event(
            "chemistry",
            "Introduction to Chemistry",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
        ]}
      />
    );

    const eventSlot = screen
      .getByRole("button", {
        name: /Introduction to Chemistry/iu,
      })
      .closest<HTMLElement>('[class*="timedEvent"]');
    const eventLayer = screen
      .getByRole("status", {
        name: /Current time/iu,
      })
      .closest<HTMLElement>('[class*="eventLayer"]');

    assert(eventLayer).toContainElement(eventSlot);
  });

  it("renders all-day and multi-day bars with middle segment semantics", () => {
    render(
      <DayGrid
        {...BASE_PROPS}
        events={[
          event(
            "welcome",
            "Welcome lecture events",
            "2026-08-23T00:00:00.000Z",
            "2026-08-26T00:00:00.000Z",
            {
              allDay: true,
            }
          ),
        ]}
      />
    );

    const slot = screen.getByRole("button", {
      name: /Welcome lecture events/iu,
    });
    assert(slot.closest('[class*="allDayEvent"]')).toBeTruthy();
    assert(slot.className).toContain("segmentMiddle");
  });

  it("shows now line only when displayed day matches current instant day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T13:30:00.000Z"));
    const { rerender } = render(<DayGrid {...BASE_PROPS} events={[]} />);

    screen.getByRole("status", { name: /Current time/iu });

    assert(
      screen
        .getByRole("status", { name: /Current time/iu })
        .getAttribute("aria-label")
    ).toMatch(/Current time/u);

    rerender(
      <DayGrid {...BASE_PROPS} date={calendarDate("2026-08-25")} events={[]} />
    );

    assert(screen.queryByRole("status", { name: /Current time/iu })).toBeNull();
  });

  it("marks non-working days and hours in text without shading the cells", () => {
    const { container } = render(
      <DayGrid {...BASE_PROPS} date={calendarDate("2026-08-23")} events={[]} />
    );

    assert(
      container.querySelector<HTMLElement>("section.dayGrid")?.className
    ).toContain("nonWorkingDay");

    assert(
      screen.getAllByRole("gridcell", { name: /non-working hour/iu }).length
    ).toBeGreaterThan(0);
  });

  it("opens on the first working hour for the ordinary grid", () => {
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(24 * 43);

    try {
      render(<DayGrid {...BASE_PROPS} events={[]} />);
      const body = requiredElement(screen.getByRole("presentation"));

      assert(body.scrollTop).toBe(43 * 8);
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it("repositions when the displayed day changes", () => {
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(24 * 43);

    try {
      const { rerender } = render(<DayGrid {...BASE_PROPS} events={[]} />);
      const body = requiredElement(screen.getByRole("presentation"));
      body.scrollTop = 0;

      rerender(
        <DayGrid
          {...BASE_PROPS}
          date={calendarDate("2026-08-26")}
          events={[]}
        />
      );

      assert(body.scrollTop).toBe(43 * 8);
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it("keeps the user scroll position across interactions that re-render", async () => {
    const user = userEvent.setup();
    render(<DayGrid {...BASE_PROPS} events={[]} />);
    const body = screen.getByRole("presentation");

    vi.spyOn(body, "scrollHeight", "get").mockReturnValue(1032);
    body.scrollTop = 700;

    const cell = screen.getByRole("gridcell", { name: /11:00/iu });
    cell.focus();
    await user.keyboard("{ArrowDown}");

    assert(body.scrollTop).toBe(700);
  });

  it("moves grid focus with arrow keys and updates live focus announcement", async () => {
    const user = userEvent.setup();
    render(<DayGrid {...BASE_PROPS} events={[]} />);

    const firstWorkingCell = screen.getByRole("gridcell", {
      name: /08:00.*working hour/iu,
    });
    firstWorkingCell.focus();
    await user.keyboard("{ArrowDown}");

    const nextCell = screen.getByRole("gridcell", {
      name: /09:00.*working hour/iu,
    });
    assert(document.activeElement).toBe(nextCell);
    screen.getByRole("status", { name: /09:00.*working hour/iu });
  });

  it("calls event selection callback from keyboard-activated slots", async () => {
    const user = userEvent.setup();
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();

    render(
      <DayGrid
        {...BASE_PROPS}
        onEventSelect={onEventSelect}
        events={[
          event(
            "chemistry",
            "Introduction to Chemistry",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
        ]}
      />
    );

    const eventButton = screen.getByRole("button", {
      name: /Introduction to Chemistry/iu,
    });
    eventButton.focus();
    await user.keyboard("{Enter}");

    assert(onEventSelect).toHaveBeenCalledOnce();

    const [selectedEvent, selectedContext] = onEventSelect.mock.calls[0] ?? [];

    assert(selectedEvent?.id).toBe("chemistry");
    assert(selectedContext?.event.id).toBe("chemistry");
  });

  it("opens an empty timed cell with its date, local time, and anchor", async () => {
    const user = userEvent.setup();
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();

    render(
      <DayGrid {...BASE_PROPS} events={[]} onQuickCreate={onQuickCreate} />
    );

    const cell = screen.getByRole("gridcell", {
      name: /09:00.*working hour/iu,
    });
    await user.click(cell);

    const payload = requiredPayload(onQuickCreate.mock.calls[0]?.[0]);

    assert(payload.range.start).toMatchObject({
      date: calendarDate("2026-08-24"),
      startTime: parseLocalTime("09:00"),
    });
    assert(payload.range.end).toStrictEqual(payload.range.start);
    assert(payload.range.cells).toHaveLength(1);
    assert(payload.anchorRect).toBeDefined();
  });

  it("opens an empty timed cell from the existing keyboard interaction", async () => {
    const user = userEvent.setup();
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();
    render(
      <DayGrid {...BASE_PROPS} events={[]} onQuickCreate={onQuickCreate} />
    );

    const cell = screen.getByRole("gridcell", {
      name: /09:00.*working hour/iu,
    });
    cell.focus();
    await user.keyboard("{Enter}");

    const payload = requiredPayload(onQuickCreate.mock.calls[0]?.[0]);

    assert(payload.range.start).toMatchObject({
      date: calendarDate("2026-08-24"),
      startTime: parseLocalTime("09:00"),
    });
    assert(payload.range.end).toStrictEqual(payload.range.start);
    assert(payload.range.cells).toHaveLength(1);
    assert(payload.anchorRect).toBeDefined();
  });

  it("renders the ordinary grid with no alert region", () => {
    render(<DayGrid {...BASE_PROPS} events={[]} />);

    assert(screen.getByRole("grid")).toBeInTheDocument();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects empty-cell creation in read-only mode", async () => {
    const user = userEvent.setup();
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();

    render(
      <DayGrid
        {...BASE_PROPS}
        events={[]}
        interactionMode="read-only"
        onQuickCreate={onQuickCreate}
      />
    );

    await user.click(
      screen.getByRole("gridcell", { name: /09:00.*working hour/iu })
    );

    assert(onQuickCreate).not.toHaveBeenCalled();
  });

  it("keeps existing event activation separate from empty-cell creation", async () => {
    const user = userEvent.setup();
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();

    render(
      <DayGrid
        {...BASE_PROPS}
        events={[
          event(
            "chemistry",
            "Introduction to Chemistry",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
        ]}
        onQuickCreate={onQuickCreate}
        onEventSelect={onEventSelect}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Introduction to Chemistry/iu })
    );

    assert(onEventSelect).toHaveBeenCalledOnce();

    const [selectedEvent, selectedContext] = onEventSelect.mock.calls[0] ?? [];

    assert(selectedEvent?.id).toBe("chemistry");
    assert(selectedContext?.event.id).toBe("chemistry");
    assert(onQuickCreate).not.toHaveBeenCalled();
  });
});

const NO_DAY_EVENTS: readonly CalendarEvent[] = [];

describe("DayGrid ordinary grid rendering", () => {
  it("lays the ordinary grid inside the timed grid with no special regions", () => {
    const { rerender } = render(
      <DayGrid {...BASE_PROPS} events={NO_DAY_EVENTS} />
    );

    assert(screen.getAllByRole("gridcell")).toHaveLength(24);
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<DayGrid {...BASE_PROPS} events={NO_DAY_EVENTS} />);

    assert(screen.getAllByRole("gridcell")).toHaveLength(24);
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the now line rendered while the day is empty", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T13:30:00.000Z"));

    render(<DayGrid {...BASE_PROPS} events={NO_DAY_EVENTS} />);

    screen.getByRole("status", { name: /Current time/iu });
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
