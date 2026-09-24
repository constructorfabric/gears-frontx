import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  allDayEvent,
  timedEvent,
  UTC,
  identityTranslate as t,
} from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type {
  CalendarConflict,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarEventSegment,
} from "../../../core/model";
import { englishTranslate } from "../../../i18n/english";
import { EventCard } from "../event-card";
import type { EventCardProps } from "../event-card";

import cardStyles from "../event-card.module.css";

const DATE = calendarDate("2026-08-24");

const UNIT_EVENT = {
  colorFamily: "purple" as const,
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id: "unit-1",
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Unit event",
};

const UNIT_ALL_DAY_EVENT = {
  colorFamily: "turquoise" as const,
  endDate: calendarDate("2026-08-25"),
  id: "allday-unit",
  startDate: DATE,
  timeZone: UTC,
  title: "All-day unit",
};

interface SchedulePayload {
  readonly courseCode: string;
  readonly classroom: string;
  readonly capacity: number;
  readonly instructor: string;
  readonly programSection: string;
}

type TimedEventOverrides<Payload> = Partial<
  Omit<Extract<CalendarEvent<Payload>, { readonly allDay: false }>, "allDay">
>;

const SCHEDULE_METADATA: SchedulePayload = {
  capacity: 30,
  classroom: "Room B12",
  courseCode: "CHEM-101",
  instructor: "Dr. Smith",
  programSection: "BSc CS / Section 2",
};

const scheduleEvent = (
  overrides: TimedEventOverrides<SchedulePayload> = {}
): CalendarEvent<SchedulePayload> => ({
  allDay: false,
  available: true,
  colorFamily: "purple",
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id: "event-1",
  metadata: SCHEDULE_METADATA,
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Chemistry",
  ...overrides,
});

const scheduleAllDayEvent = (): CalendarEvent<SchedulePayload> => ({
  allDay: true,
  colorFamily: "turquoise",
  endDate: calendarDate("2026-08-25"),
  endTime: null,
  id: "allday-1",
  startDate: DATE,
  startTime: null,
  timeZone: UTC,
  title: "Faculty meeting",
});

const renderUnitCard = (overrides: Partial<EventCardProps> = {}) =>
  render(
    <EventCard
      event={timedEvent(UNIT_EVENT)}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );

const renderCard = (overrides: Partial<EventCardProps<SchedulePayload>> = {}) =>
  render(
    <EventCard
      event={scheduleEvent()}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );

const getCard = (): HTMLElement =>
  screen.getByRole("button", { name: /Chemistry/u });

const eventGeometry = (height: number): CalendarEventGeometry => ({
  height,
  inlineSize: 120,
  insetInlineStart: 0,
  top: 0,
  zIndex: 1,
});

describe(EventCard, () => {
  it("renders the default title, time range, and event-id CSS hook for a timed event", () => {
    renderCard();
    const card = getCard();

    expect(card).toHaveAttribute("data-event-id", "event-1");
    expect(card.textContent).toContain("Chemistry");
    expect(card.textContent).toMatch(/9:00/u);
    expect(card.textContent).toMatch(/10:00/u);
  });

  it("renders an all-day event without a time of day", () => {
    renderCard({ event: scheduleAllDayEvent() });
    const card = screen.getByRole("button", { name: /Faculty meeting/u });

    expect(card).toHaveAttribute("data-event-id", "allday-1");
    expect(card.textContent).toContain("Faculty meeting");
    expect(card.textContent).not.toMatch(/\d{1,2}:\d{2}/u);
  });

  it("lets a product render Schedule metadata without changing the event card", () => {
    const renderMetadata = vi.fn<
      (context: CalendarEventRenderContext<SchedulePayload>) => ReactNode
    >((context) => (
      <span>
        Schedule {context.event.metadata?.courseCode}{" "}
        {context.event.metadata?.classroom}
      </span>
    ));

    renderCard({ renderMetadata });
    const card = getCard();

    expect(screen.getByText("Schedule CHEM-101 Room B12")).toBeVisible();
    expect(card.textContent).toContain("Chemistry");
    expect(renderMetadata).toHaveBeenCalledOnce();
    expect(renderMetadata.mock.calls[0]?.[0].event.metadata).toStrictEqual(
      SCHEDULE_METADATA
    );
  });

  it("calls the metadata renderer with undefined metadata for events without metadata", () => {
    const renderMetadata = vi.fn<
      (context: CalendarEventRenderContext<SchedulePayload>) => ReactNode
    >((context) => (
      <span>{context.event.metadata?.courseCode ?? "undefined"}</span>
    ));

    renderCard({
      event: scheduleEvent({ metadata: undefined }),
      renderMetadata,
    });

    expect(getCard()).toBeTruthy();
    expect(renderMetadata).toHaveBeenCalledOnce();
    expect(renderMetadata.mock.calls[0]?.[0].event.metadata).toBeUndefined();
  });

  it("replaces the default title through the renderTitle slot", () => {
    const renderTitle = vi.fn<
      (context: CalendarEventRenderContext) => ReactNode
    >(() => <span>Custom course title</span>);
    renderCard({ renderTitle });

    expect(screen.getByText("Custom course title")).toBeVisible();
    expect(screen.queryByText("Chemistry")).toBeNull();
    expect(renderTitle).toHaveBeenCalledOnce();
    expect(renderTitle.mock.calls[0]?.[0]?.event.id).toBe("event-1");
  });

  it("replaces the default time through the renderTime slot", () => {
    const renderTime = vi.fn<
      (context: CalendarEventRenderContext) => ReactNode
    >(() => <span>09:00–10:00 CET</span>);
    renderCard({ renderTime });

    expect(screen.getByText("09:00–10:00 CET")).toBeVisible();
    expect(renderTime).toHaveBeenCalledOnce();
    expect(renderTime.mock.calls[0]?.[0]?.event.id).toBe("event-1");
  });

  it("applies supplied geometry as inline layout values", () => {
    const geometry: CalendarEventGeometry = {
      height: 40,
      inlineSize: 120,
      insetInlineStart: 5,
      top: 10,
      zIndex: 2,
    };

    renderCard({ geometry });

    expect(getCard()).toHaveStyle({
      height: "40px",
      inlineSize: "120px",
      insetInlineStart: "5px",
      top: "10px",
      zIndex: "2",
    });
  });

  it("selects on click, Enter, and Space with the event and render context", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (
          event: CalendarEvent<SchedulePayload>,
          context: CalendarEventRenderContext<SchedulePayload>
        ) => void
      >();

    const event = scheduleEvent();
    renderCard({ event, onSelect });
    const card = getCard();

    await user.click(card);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect.mock.calls[0]?.[0]).toStrictEqual(event);
    expect(onSelect.mock.calls[0]?.[1]).toStrictEqual(
      expect.objectContaining({
        conflicts: [],
        event,
        isAvailable: true,
        isPast: false,
        isReadOnly: false,
        isSelected: false,
      })
    );
  });

  it("does not throw when no selection callback is supplied", async () => {
    const user = userEvent.setup();
    renderCard();
    const card = getCard();

    await expect(user.click(card)).resolves.not.toThrow();
    expect(card).toBeTruthy();
  });

  it("does not activate an unavailable event by click, Enter, or Space", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (
          event: CalendarEvent<SchedulePayload>,
          context: CalendarEventRenderContext<SchedulePayload>
        ) => void
      >();

    renderCard({ event: scheduleEvent({ available: false }), onSelect });
    const card = getCard();

    expect(card).toHaveAttribute("aria-disabled", "true");
    await user.click(card);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not activate a busy-access event by click, Enter, or Space", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (
          event: CalendarEvent<SchedulePayload>,
          context: CalendarEventRenderContext<SchedulePayload>
        ) => void
      >();

    renderCard({ event: scheduleEvent({ access: "busy" }), onSelect });
    const card = getCard();

    expect(card).toHaveAttribute("aria-disabled", "true");
    await user.click(card);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps a read-only card selectable for viewing", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (
          event: CalendarEvent<SchedulePayload>,
          context: CalendarEventRenderContext<SchedulePayload>
        ) => void
      >();

    renderCard({ onSelect, readOnly: true });

    await user.click(getCard());

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("exposes selected, past, unavailable, and read-only states through contracted ARIA observables", () => {
    const { rerender } = renderCard();

    const expectations: readonly {
      readonly props: Partial<EventCardProps<SchedulePayload>>;
      readonly check: (card: HTMLElement) => void;
    }[] = [
      {
        check: (card) => {
          expect(card).toHaveAttribute("aria-pressed", "true");
        },
        props: { selected: true },
      },
      {
        check: (card) => {
          expect(card).toHaveAccessibleDescription(/Past/u);
        },
        props: { past: true },
      },
      {
        check: (card) => {
          expect(card).toHaveAttribute("aria-disabled", "true");
        },
        props: { available: false },
      },
      {
        check: (card) => {
          expect(card).toHaveAccessibleDescription(/Read only/u);
        },
        props: { readOnly: true },
      },
    ];

    for (const { props, check } of expectations) {
      rerender(
        <EventCard
          event={scheduleEvent()}
          timeZone={UTC}
          locale="en-US"
          t={t}
          direction="ltr"
          {...props}
        />
      );

      check(getCard());
    }
  });

  it("renders supplied conflicts with their dimensions by default", () => {
    const conflicts: readonly CalendarConflict[] = [
      { dimension: "instructor", id: "c1", label: "Dr. Smith" },
    ];
    renderCard({ conflicts });
    const card = getCard();

    expect(card.textContent).toContain("instructor");
    expect(card.textContent).toContain("Dr. Smith");
  });

  it("uses severity modifier classes for card conflicts", () => {
    const conflicts: readonly CalendarConflict[] = [
      {
        dimension: "instructor",
        id: "warning",
        label: "Dr. Smith",
        severity: "warning",
      },
      {
        dimension: "classroom",
        id: "error",
        label: "Room B12",
        severity: "error",
      },
    ];

    renderCard({ conflicts });

    const items = screen.getAllByRole("listitem");

    expect(items[0]).toHaveClass(cardStyles.warning);
    expect(items[1]).toHaveClass(cardStyles.error);
  });

  it("replaces conflict rendering through the renderConflict slot", () => {
    const conflicts: readonly CalendarConflict[] = [
      { dimension: "classroom", id: "c1", label: "Room B12" },
    ];

    const renderConflict = vi.fn<
      (
        conflict: CalendarConflict,
        context: CalendarEventRenderContext
      ) => ReactNode
    >((conflict) => <span>Clash: {conflict.label}</span>);
    renderCard({ conflicts, renderConflict });

    expect(screen.getByText("Clash: Room B12")).toBeVisible();
    expect(renderConflict).toHaveBeenCalledOnce();
    expect(renderConflict.mock.calls[0]?.[0]).toStrictEqual(conflicts[0]);
    expect(renderConflict.mock.calls[0]?.[1]?.event.id).toBe("event-1");
  });

  it("carries the supplied segment into the render context", () => {
    const event = scheduleEvent();

    const segment: CalendarEventSegment = {
      date: DATE,
      end: utcInstant("2026-08-24T10:00:00.000Z"),
      event,
      segment: "middle",
      start: utcInstant("2026-08-24T09:00:00.000Z"),
    };

    const renderMetadata = vi.fn<
      (context: CalendarEventRenderContext<SchedulePayload>) => ReactNode
    >((context) => <span>{context.event.id}</span>);

    renderCard({ event, renderMetadata, segment });

    expect(getCard().textContent).toContain("Chemistry");
    expect(renderMetadata.mock.calls[0]?.[0].segment).toStrictEqual(segment);
  });

  it("forwards className to the card root", () => {
    const { container } = renderCard({ className: "consumer-card" });
    const root = container.firstElementChild;

    if (!(root instanceof HTMLElement)) {
      throw new Error("Expected EventCard to render a root element");
    }

    expect(root).toHaveClass("consumer-card");
  });
});

describe("EventCard geometry tiers", () => {
  it("resolves every tier at its effective-height boundary", () => {
    const cases: readonly [number, string][] = [
      [20, "title"],
      [21, "single"],
      [39, "single"],
      [40, "stacked"],
      [87, "stacked"],
      [88, "full"],
      [126, "full"],
    ];

    for (const [height, layout] of cases) {
      const { unmount } = renderCard({ geometry: eventGeometry(height) });
      expect(getCard()).toHaveAttribute("data-event-card-layout", layout);
      unmount();
    }
  });

  it("uses the one-line treatment at the 21px compact boundary", () => {
    renderCard({ geometry: eventGeometry(21) });

    const card = getCard();

    expect(card).toHaveAttribute("data-event-card-layout", "single");
    expect(card).toHaveAttribute("data-event-card-compact", "true");
    expect(card).toHaveTextContent(/Chemistry.*9:00/u);
  });

  it("shows only the start minute without a clock icon on the compact strip", () => {
    renderCard({ geometry: eventGeometry(21) });

    const card = getCard();

    expect(card).toHaveTextContent(/9:00/u);
    expect(card).not.toHaveTextContent(/10:00/u);
    expect(card.querySelector("svg.lucide-clock")).toBeNull();
  });

  it("keeps a minimized all-day card title-only", () => {
    renderCard({ event: scheduleAllDayEvent(), geometry: eventGeometry(21) });

    const card = screen.getByRole("button", { name: /Faculty meeting/u });

    expect(card).toHaveAttribute("data-event-card-layout", "single");
    expect(card).not.toHaveTextContent(/\d{1,2}:\d{2}/u);
  });
});

describe("EventCard accessibility", () => {
  it("exposes the event as a button whose accessible name carries the title", () => {
    renderCard();
    const card = getCard();

    expect(card).toHaveAccessibleName();
    expect(card.getAttribute("aria-label") ?? card.textContent).toContain(
      "Chemistry"
    );
  });

  it("keeps a non-empty accessible name when the title is missing", () => {
    renderCard({ event: scheduleEvent({ title: "" }) });
    const buttons = screen.getAllByRole("button");

    expect(buttons).toHaveLength(1);
    const name =
      (buttons[0].getAttribute("aria-label") ?? buttons[0].textContent) || "";
    expect(name.trim()).not.toBe("");
  });

  it("reports unavailable state through ARIA", () => {
    renderCard({ event: scheduleEvent({ available: false }) });

    expect(getCard()).toHaveAttribute("aria-disabled", "true");
  });

  it("reports selection through aria-pressed", () => {
    renderCard({ selected: true });

    expect(getCard()).toHaveAttribute("aria-pressed", "true");
  });

  it("names past and read-only in the accessible description", () => {
    renderCard({ past: true, readOnly: true, t: englishTranslate });

    expect(getCard()).toHaveAccessibleDescription("Past, Read only");
  });

  it("activates with Enter and Space while keeping focus on the card", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    renderCard({ onSelect });
    const card = getCard();

    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(card).toHaveFocus();
  });

  it("ignores repeated Enter and Space keydown events", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    renderCard({ onSelect });
    const card = getCard();

    fireEvent.keyDown(card, { key: "Enter", repeat: true });
    fireEvent.keyDown(card, { key: " ", repeat: true });

    expect(onSelect).not.toHaveBeenCalled();

    card.focus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("ignores keyboard activation on a disabled event and keeps focus", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    renderCard({ event: scheduleEvent({ available: false }), onSelect });
    const card = getCard();

    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).not.toHaveBeenCalled();
    expect(card).toHaveFocus();
  });
});

describe("EventCard unit behaviour beyond the acceptance suite", () => {
  it("shows only the start time when a timed event has no end time", () => {
    renderUnitCard({ event: timedEvent({ ...UNIT_EVENT, endTime: null }) });
    const card = screen.getByRole("button", { name: /Unit event/u });

    expect(card.textContent).toMatch(/9:00/u);
    expect(card.textContent).not.toMatch(/10:00/u);
  });

  it("lets the available prop override the event availability flag", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    renderUnitCard({
      available: true,
      event: timedEvent({ ...UNIT_EVENT, available: false }),
      onSelect,
    });
    const card = screen.getByRole("button", { name: /Unit event/u });

    expect(card).not.toHaveAttribute("aria-disabled");
    await user.click(card);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("falls back to the event instants for the context segment of a timed event", () => {
    const renderMetadata = vi.fn<
      (context: CalendarEventRenderContext) => ReactNode
    >((context) => <span>{context.event.id}</span>);
    const event = timedEvent(UNIT_EVENT);
    renderUnitCard({ event, renderMetadata });

    const context = renderMetadata.mock.calls[0]?.[0];
    expect(context?.segment).toStrictEqual({
      date: DATE,
      end: event.end,
      event,
      segment: null,
      start: event.start,
    });
  });

  it("falls back to viewer-day boundaries for the context segment of an all-day event", () => {
    const renderMetadata = vi.fn<
      (context: CalendarEventRenderContext) => ReactNode
    >((context) => <span>{context.event.id}</span>);
    renderUnitCard({ event: allDayEvent(UNIT_ALL_DAY_EVENT), renderMetadata });

    const context = renderMetadata.mock.calls[0]?.[0];
    expect(context?.segment.start).toBe(utcInstant("2026-08-24T00:00:00.000Z"));
    expect(context?.segment.end).toBe(utcInstant("2026-08-25T00:00:00.000Z"));
    expect(context?.segment.segment).toBeNull();
  });

  it("calls the consumer onKeyDown handler with the keyboard event and render context", async () => {
    const user = userEvent.setup();
    const onKeyDown =
      vi.fn<
        (
          event: ReactKeyboardEvent<HTMLButtonElement>,
          context: CalendarEventRenderContext
        ) => void
      >();
    renderUnitCard({ onKeyDown });
    const card = screen.getByRole("button", { name: /Unit event/u });

    card.focus();
    await user.keyboard("{ArrowDown}");

    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onKeyDown.mock.calls[0]?.[1]?.conflicts).toStrictEqual([]);
    expect(onKeyDown.mock.calls[0]?.[1]?.event.id).toBe("unit-1");
  });

  it("uses CSS modifier classes for known colour families", () => {
    const colours = [
      { className: cardStyles.colorTurquoise, colorFamily: "turquoise" },
      { className: cardStyles.colorPurple, colorFamily: "purple" },
      { className: cardStyles.colorOrange, colorFamily: "orange" },
    ] as const;

    for (const { colorFamily, className } of colours) {
      const { unmount } = renderUnitCard({
        event: timedEvent({ ...UNIT_EVENT, colorFamily }),
      });
      const card = screen.getByRole("button", { name: /Unit event/u });

      expect(card).toHaveClass(className);
      unmount();
    }
  });

  it("keeps an unknown colour family actionable without a colour modifier", async () => {
    const user = userEvent.setup();
    const onSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    renderUnitCard({
      event: timedEvent({ ...UNIT_EVENT, colorFamily: "magenta" }),
      onSelect,
    });
    const card = screen.getByRole("button", { name: /Unit event/u });

    expect(card).not.toHaveClass(cardStyles.colorTurquoise);
    expect(card).not.toHaveClass(cardStyles.colorPurple);
    expect(card).not.toHaveClass(cardStyles.colorOrange);
    await user.click(card);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("renders the translated all-day marker instead of a time of day", () => {
    renderUnitCard({ event: allDayEvent(UNIT_ALL_DAY_EVENT) });
    const card = screen.getByRole("button", { name: /All-day unit/u });

    expect(card.textContent).toContain("All day");
    expect(card.textContent).not.toMatch(/\d{1,2}:\d{2}/u);
  });
});
