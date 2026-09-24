import { render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect as assert,
  it,
  vi,
} from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import type {
  CalendarCellContext,
  CalendarColorFamily,
  CalendarDirection,
  CalendarEvent,
  CalendarEventRenderContext,
  IanaTimeZone,
} from "../../../core/model";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { englishTranslate as t } from "../../../i18n/english";
import { DayGrid } from "../day-grid";

const NEW_YORK = parseIanaTimeZone("America/New_York");
const FIXED_NOW = new Date("2026-08-24T13:30:00.000Z");

const requiredElement = <T extends Element>(element: T | null): T => {
  if (!element) {
    throw new Error("Expected calendar element to render");
  }

  return element;
};

const byToken = (root: Element, token: string): HTMLElement =>
  requiredElement(root.querySelector(`[class*="${token}"]`));

const DIRECTION: CalendarDirection = "ltr";

const baseProps = (
  timeZone: IanaTimeZone = UTC,
  locale = "en-US"
): {
  date: ReturnType<typeof calendarDate>;
  direction: CalendarDirection;
  locale: string;
  t: CalendarTranslate;
  timeZone: IanaTimeZone;
} => ({
  date: calendarDate("2026-08-24"),
  direction: DIRECTION,
  locale,
  t,
  timeZone,
});

interface EventOptions {
  readonly access?: CalendarEvent["access"];
  readonly allDay?: boolean;
  readonly available?: boolean;
  readonly colorFamily?: CalendarColorFamily;
}

const event = (
  id: string,
  title: string,
  start: string,
  end: string,
  options: EventOptions = {}
): CalendarEvent => {
  const {
    allDay = false,
    access = "full",
    available,
    colorFamily = "turquoise",
  } = options;

  const common = {
    access,
    attendees: [],
    calendarId: null,
    colorFamily,
    conferencingProviderId: null,
    description: "",
    id,
    location: null,
    recurrenceRule: null,
    timeZone: UTC,
    title,
    ...(available === undefined ? {} : { available }),
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

  return {
    ...common,
    allDay: false,
    end: utcInstant(end),
    endDate: calendarDate(end.slice(0, 10)),
    endTime: parseLocalTime(end.slice(11, 16)),
    start: utcInstant(start),
    startDate: calendarDate(start.slice(0, 10)),
    startTime: parseLocalTime(start.slice(11, 16)),
  };
};

const renderCustomTitle = (context: CalendarEventRenderContext) => (
  <span data-testid="custom-title">{`CUSTOM:${context.event.title}`}</span>
);

const renderCellProbe = (context: CalendarCellContext) => (
  <span>{context.isUnavailable ? "BUSY" : "FREE"}</span>
);

describe("DayGrid boundaries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks header offset, weekday, and day number across locale, time zone, and DST", () => {
    const capture = (
      timeZone: IanaTimeZone,
      date: string,
      locale: string
    ): string => {
      const { container, unmount } = render(
        <DayGrid
          {...baseProps(timeZone, locale)}
          date={calendarDate(date)}
          events={[]}
        />
      );
      const header = requiredElement(byToken(container, "header"));
      const html = header.outerHTML;
      unmount();

      return html;
    };

    const snapshots = [
      capture(UTC, "2026-08-24", "en-US"),
      capture(NEW_YORK, "2026-08-24", "en-US"),
      capture(NEW_YORK, "2026-03-08", "en-US"),
      capture(UTC, "2026-08-24", "en-GB"),
    ];

    assert(snapshots).toMatchSnapshot();
  });

  it("carries the timezone title on the header gutter for the DST boundary", () => {
    const { container } = render(
      <DayGrid
        {...baseProps(NEW_YORK, "en-US")}
        date={calendarDate("2026-03-08")}
        events={[]}
      />
    );
    const gutter = byToken(container, "headerGutter");

    assert(gutter.getAttribute("title")).toBe("America/New_York");
    assert(gutter.textContent).not.toBe("");
  });

  it("locks unavailable read-only ARIA and the read-only class", () => {
    const readOnly = render(
      <DayGrid
        {...baseProps()}
        interactionMode="read-only"
        events={[
          event(
            "busy",
            "Busy block",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z",
            { access: "busy" }
          ),
          event(
            "unavailable",
            "Unavailable block",
            "2026-08-24T11:00:00.000Z",
            "2026-08-24T12:00:00.000Z",
            { available: false }
          ),
        ]}
      />
    );

    const busyCard = screen.getByRole("button", { name: /Busy block/iu });
    const unavailableCard = screen.getByRole("button", {
      name: /Unavailable block/iu,
    });
    assert(busyCard.getAttribute("aria-disabled")).toBe("true");
    assert(unavailableCard.getAttribute("aria-disabled")).toBe("true");
    assert(busyCard.className).toContain("readOnly");
    assert(unavailableCard.className).toContain("readOnly");
    assert(
      requiredElement(readOnly.container).querySelector(
        '[data-event-id="busy"]'
      )
    ).toHaveAttribute("aria-disabled", "true");
    assert(
      requiredElement(readOnly.container).querySelector(
        '[data-event-id="unavailable"]'
      )
    ).toHaveAttribute("aria-disabled", "true");
    readOnly.unmount();

    const editable = render(
      <DayGrid
        {...baseProps()}
        events={[
          event(
            "free",
            "Free block",
            "2026-08-24T11:00:00.000Z",
            "2026-08-24T12:00:00.000Z"
          ),
        ]}
      />
    );
    const freeCard = screen.getByRole("button", { name: /Free block/iu });

    assert(freeCard.getAttribute("aria-disabled")).not.toBe("true");
    assert(freeCard.className).not.toContain("readOnly");
    assert(
      byToken(editable.container, "headerGutter").getAttribute("title")
    ).toBe("UTC");
    editable.unmount();
  });

  it("skips events that do not intersect the displayed day and surfaces no alert", () => {
    const { container } = render(
      <DayGrid
        {...baseProps()}
        events={[
          event(
            "other-day-timed",
            "Other day timed",
            "2026-08-25T09:00:00.000Z",
            "2026-08-25T10:00:00.000Z"
          ),
          event(
            "other-day-allday",
            "Other day all-day",
            "2026-08-25T00:00:00.000Z",
            "2026-08-27T00:00:00.000Z",
            { allDay: true }
          ),
          event(
            "boundary",
            "Boundary event",
            "2026-08-23T22:00:00.000Z",
            "2026-08-24T00:00:00.000Z"
          ),
        ]}
      />
    );

    assert(
      screen.queryByRole("button", { name: /Other day timed/iu })
    ).toBeNull();
    assert(
      screen.queryByRole("button", { name: /Other day all-day/iu })
    ).toBeNull();
    assert(
      screen.queryByRole("button", { name: /Boundary event/iu })
    ).toBeNull();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
    assert(byToken(container, "allDayEmpty").textContent).toBe(
      "No all-day events"
    );
  });

  it("honours the custom event slot by replacing the title and suppressing the time row", () => {
    const { container } = render(
      <DayGrid
        {...baseProps()}
        renderEvent={renderCustomTitle}
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

    assert(
      screen.getAllByText("CUSTOM:Introduction to Chemistry").length
    ).toBeGreaterThan(0);
    assert(
      screen.getByRole("button", { name: /CUSTOM:Introduction to Chemistry/iu })
    ).not.toHaveTextContent(/09:00|10:00/iu);

    const eventLayer = byToken(container, "eventLayer");

    assert(
      eventLayer.querySelector('[data-testid="custom-title"]')
    ).toHaveTextContent("CUSTOM:Introduction to Chemistry");
    assert(
      eventLayer.querySelector('[data-event-card-time="true"]')
    ).toBeEmptyDOMElement();
  });

  it("renders a custom cell slot that observes unavailable cells", () => {
    render(
      <DayGrid
        {...baseProps()}
        renderCell={renderCellProbe}
        events={[
          event(
            "busy",
            "Busy block",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z",
            { access: "busy" }
          ),
        ]}
      />
    );

    assert(screen.getAllByText("BUSY").length).toBeGreaterThan(0);
  });
});
