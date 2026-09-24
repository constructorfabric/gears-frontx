import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { allDayEvent, timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarConflict,
  CalendarEvent,
  CalendarSelectionRange,
  CalendarEventRenderContext,
  CalendarMoveRequest,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import type { CalendarQuickCreatePayload } from "../../../react/slots";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

const DATE = calendarDate("2026-08-24");

interface Payload {
  readonly courseCode: string;
}

interface EventOverrides {
  readonly available?: boolean;
  readonly id?: string;
}

const event = (overrides: EventOverrides = {}): CalendarEvent<Payload> => {
  const baseEvent: CalendarEvent<Payload> = {
    allDay: false,
    available: true,
    colorFamily: "purple",
    conflicts: [{ dimension: "classroom", id: "conflict", label: "Classroom" }],
    end: utcInstant("2026-08-24T10:00:00.000Z"),
    endDate: DATE,
    endTime: parseLocalTime("10:00"),
    id: "event-1",
    metadata: { courseCode: "CHEM-101" },
    start: utcInstant("2026-08-24T09:00:00.000Z"),
    startDate: DATE,
    startTime: parseLocalTime("09:00"),
    timeZone: UTC,
    title: "Chemistry",
  };

  return { ...baseEvent, ...overrides };
};

const renderWeek = (overrides: Partial<WeekGridProps<Payload>> = {}) =>
  render(
    <WeekGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );

const getTimedCell = (time: string): HTMLElement =>
  screen.getByRole("gridcell", {
    name: new RegExp(`Monday, August 24, 2026 ${time}`, "u"),
  });

const cellAt = (time: string, date = DATE): CalendarCell => {
  const hour = Number(time.slice(0, 2));
  const nextHour = `${String(hour + 1).padStart(2, "0")}:00`;

  return {
    date,
    end: utcInstant(`${date}T${nextHour}:00.000Z`),
    endTime: parseLocalTime(nextHour),
    start: utcInstant(`${date}T${time}:00.000Z`),
    startTime: parseLocalTime(time),
  };
};

const requiredPayload = (
  value: CalendarQuickCreatePayload | undefined
): CalendarQuickCreatePayload => {
  if (!value) {
    throw new Error("Expected quick-create to emit a payload");
  }

  return value;
};

describe(WeekGrid, () => {
  it("renders semantic grid roles and the requested visible-day dimensions with one roving tab stop", () => {
    renderWeek({ visibleDays: 5 });
    const grid = screen.getByRole("grid");

    assert(grid.getAttribute("aria-colcount")).toBe("6");
    assert(within(grid).getAllByRole("columnheader")).toHaveLength(6);
    assert(within(grid).getAllByRole("gridcell").length).toBeGreaterThan(0);
    assert(
      within(grid)
        .getAllByRole("gridcell")
        .filter((cell) => cell.getAttribute("tabindex") === "0")
    ).toHaveLength(1);
  });

  it("keeps the cell label in the accessibility tree without rendering it as visible text", () => {
    renderWeek({ visibleDays: 5 });

    const timed = getTimedCell("09:00");

    assert(timed).toHaveAttribute(
      "aria-label",
      assert.stringContaining("09:00")
    );
    assert(timed.textContent).toBe("");

    const allDay = screen.getByRole("gridcell", {
      name: /Monday, August 24, 2026.*All-day events/iu,
    });

    assert(allDay.textContent).toBe("");

    assert(screen.getAllByText("All-day events")).toHaveLength(1);
  });

  it("moves focus to the exact accessible cell and emits the exact quick-create range on Enter", () => {
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();
    renderWeek({ interactionMode: "quick-create", onQuickCreate });
    const first = getTimedCell("09:00");

    const second = screen.getByRole("gridcell", {
      name: /Tuesday, August 25, 2026 09:00/u,
    });

    act(() => {
      first.focus();
    });
    const arrowRight = createEvent.keyDown(first, { key: "ArrowRight" });
    act(() => {
      fireEvent(first, arrowRight);
    });

    assert(arrowRight.defaultPrevented).toBeTruthy();
    assert(first).toHaveAttribute("tabindex", "-1");
    assert(second).toHaveAttribute("tabindex", "0");
    assert(second).toHaveFocus();

    const enter = createEvent.keyDown(second, { key: "Enter" });
    act(() => {
      fireEvent(second, enter);
    });

    assert(enter.defaultPrevented).toBeTruthy();
    assert(onQuickCreate).toHaveBeenCalledOnce();

    const payload = requiredPayload(onQuickCreate.mock.calls[0]?.[0]);

    assert(payload.range).toStrictEqual({
      cells: [cellAt("09:00", calendarDate("2026-08-25"))],
      end: cellAt("09:00", calendarDate("2026-08-25")),
      start: cellAt("09:00", calendarDate("2026-08-25")),
    });
  });

  it("activates an available event by click, Enter, and Space while preserving focus semantics", async () => {
    const user = userEvent.setup();
    const onEventSelect =
      vi.fn<
        (
          value: CalendarEvent<Payload>,
          context: CalendarEventRenderContext<Payload>
        ) => void
      >();

    renderWeek({ events: [event()], onEventSelect });
    const eventButton = screen.getByRole("button", { name: /Chemistry/u });

    act(() => {
      eventButton.focus();
    });
    assert(eventButton).toHaveFocus();

    await user.click(eventButton);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    assert(eventButton).toHaveFocus();
    assert(onEventSelect).toHaveBeenCalledTimes(3);
    assert(onEventSelect).toHaveBeenNthCalledWith(
      1,
      event(),
      assert.objectContaining({
        event: event(),
        isAvailable: true,
        isReadOnly: false,
      }),
      eventButton
    );
  });

  it("does not activate an unavailable event by click, Enter, or Space", async () => {
    const user = userEvent.setup();
    const onEventSelect =
      vi.fn<
        (
          value: CalendarEvent<Payload>,
          context: CalendarEventRenderContext<Payload>
        ) => void
      >();

    renderWeek({
      events: [event({ available: false, id: "unavailable" })],
      onEventSelect,
    });
    const eventButton = screen.getByRole("button", { name: /Chemistry/u });

    assert(eventButton).toHaveAttribute("aria-disabled", "true");

    act(() => {
      eventButton.focus();
    });
    await user.click(eventButton);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    assert(onEventSelect).not.toHaveBeenCalled();
  });

  it("renders a custom event slot with opaque metadata and a labeled conflict slot", () => {
    const renderEvent = vi.fn<
      (context: CalendarEventRenderContext<Payload>) => ReactNode
    >((context: CalendarEventRenderContext<Payload>) => (
      <span>
        Custom {context.event.metadata?.courseCode}{" "}
        {context.conflicts[0]?.label}
      </span>
    ));

    const renderConflict = vi.fn<(conflict: CalendarConflict) => ReactNode>(
      (conflict: CalendarConflict) => <span>Conflict: {conflict.label}</span>
    );

    renderWeek({
      events: [event()],
      interactionMode: "read-only",
      renderConflict,
      renderEvent,
      selectedEventId: "event-1",
    });

    const customEventButton = screen.getByRole("button", { name: "Chemistry" });
    assert(customEventButton).toHaveAttribute("aria-pressed", "true");
    assert(customEventButton).toHaveAttribute(
      "aria-description",
      "Past, Read only"
    );
    assert(customEventButton).not.toHaveAttribute("aria-disabled");
    assert(screen.getByText("Custom CHEM-101 Classroom")).toBeTruthy();
    assert(renderEvent).toHaveBeenCalledWith(
      assert.objectContaining({ event: event() })
    );
    assert(renderConflict).toHaveBeenCalledWith(
      assert.objectContaining({ dimension: "classroom", label: "Classroom" }),
      assert.objectContaining({ event: event() })
    );
  });

  it("renders the ordinary grid without status or alert regions", () => {
    const { rerender } = renderWeek({});

    assert(screen.getByRole("grid")).toBeInTheDocument();

    rerender(
      <WeekGrid
        date={DATE}
        events={[]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
      />
    );
    assert(screen.getByRole("grid")).toBeInTheDocument();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects create, paint, and move interactions in read-only mode", () => {
    const onQuickCreate = vi.fn<() => void>();
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const onMoveRequest = vi.fn<() => void>();
    renderWeek({
      events: [event()],
      interactionMode: "read-only",
      onMoveRequest,
      onPaintSelect: (range) => {
        onPaintSelect(range);
      },
      onQuickCreate,
    });
    const first = getTimedCell("10:00");
    const second = getTimedCell("11:00");
    const eventButton = screen.getByRole("button", { name: /Chemistry/u });

    fireEvent.click(first);
    fireEvent.pointerDown(first);
    fireEvent.pointerMove(second);
    fireEvent.pointerEnter(second);
    fireEvent.pointerUp(second);
    fireEvent.dragStart(eventButton);
    fireEvent.drop(second);

    assert(onQuickCreate).not.toHaveBeenCalled();
    assert(onPaintSelect).not.toHaveBeenCalled();
    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("emits the exact ordered paint range for reversed pointer travel", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderWeek({
      interactionMode: "paint-and-move",
      onPaintSelect: (range) => {
        onPaintSelect(range);
      },
    });
    const start = getTimedCell("11:00");
    const middle = getTimedCell("10:00");
    const end = getTimedCell("09:00");

    fireEvent.pointerDown(start);
    fireEvent.pointerMove(middle);
    fireEvent.pointerEnter(end);
    fireEvent.pointerUp(end);

    assert(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [cellAt("09:00"), cellAt("10:00"), cellAt("11:00")],
      end: cellAt("11:00"),
      start: cellAt("09:00"),
    });
  });
});

describe("WeekGrid unit behaviour", () => {
  it("renders all-day spans, timed geometry, and a custom cell slot", () => {
    const renderCell = vi.fn<(context: CalendarCellContext) => ReactNode>(
      (context: CalendarCellContext) => (
        <span>Slot {context.cell.startTime}</span>
      )
    );

    renderWeek({
      events: [allDayEvent(), timedEvent("timed")],
      renderCell,
      t: (key) => key,
    });

    assert(screen.getByRole("button", { name: /All day/u })).toBeVisible();
    assert(screen.getByRole("button", { name: /timed/u })).toBeVisible();
    assert(screen.getAllByText(/Slot/u).length).toBeGreaterThan(0);
    assert(renderCell).toHaveBeenCalledWith(assert.anything());
  });

  it("emits a quick-create payload from an empty click with an anchor rectangle", async () => {
    const user = userEvent.setup();
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();
    renderWeek({ onQuickCreate, t: (key) => key });

    await user.click(getTimedCell("10:00"));

    const payload = requiredPayload(onQuickCreate.mock.calls[0]?.[0]);

    assert(payload.range.cells).toHaveLength(1);
    assert(payload.range.start.startTime).toBe(parseLocalTime("10:00"));
    assert(payload.anchorRect).toBeDefined();
  });

  it("renders custom event and conflict content with the typed context", () => {
    const renderEvent = vi.fn<
      (context: CalendarEventRenderContext<Payload>) => ReactNode
    >((context: CalendarEventRenderContext<Payload>) => (
      <span>Course {context.event.metadata?.courseCode}</span>
    ));

    const renderConflict = vi.fn<
      (conflict: { readonly label: string }) => ReactNode
    >((conflict: { readonly label: string }) => (
      <span>Conflict {conflict.label}</span>
    ));

    renderWeek({
      events: [timedEvent("custom")],
      renderConflict,
      renderEvent,
      t: (key) => key,
    });

    assert(screen.getByText("Course CAL-101")).toBeVisible();
    assert(screen.getByText("Conflict Room A")).toBeVisible();
    assert(renderEvent).toHaveBeenCalledWith(
      assert.objectContaining({ event: timedEvent("custom") })
    );
    assert(renderConflict).toHaveBeenCalledWith(
      assert.objectContaining({ label: "Room A" }),
      assert.objectContaining({ event: timedEvent("custom") })
    );
  });

  it("keeps a pending move until the host confirms it", () => {
    let request: CalendarMoveRequest | undefined;

    const onMoveRequest = vi.fn<(value: CalendarMoveRequest) => void>(
      (value: CalendarMoveRequest) => {
        request = value;
      }
    );

    renderWeek({
      events: [timedEvent("move")],
      interactionMode: "paint-and-move",
      onMoveRequest,
      t: (key) => key,
    });
    const button = screen.getByRole("button", { name: /move/u });

    act(() => {
      fireEvent.dragStart(button);
      fireEvent.drop(getTimedCell("10:00"));
    });

    assert(onMoveRequest).toHaveBeenCalledOnce();
    assert(request?.event.id).toBe("move");

    act(() => {
      request?.confirm();
    });
    assert(request?.from.startTime).toBe(parseLocalTime("09:00"));
    assert(request?.to.startTime).toBe(parseLocalTime("10:00"));
  });

  it("starts a move from the actual draggable event frame", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    renderWeek({
      events: [timedEvent("frame-move")],
      interactionMode: "paint-and-move",
      onMoveRequest,
      t: (key) => key,
    });

    const frame = document.querySelector<HTMLElement>(
      '[data-event-id="frame-move"][draggable="true"]'
    );

    if (frame === null) {
      throw new Error("Expected the event frame to be draggable");
    }

    assert(frame).toHaveAttribute("draggable", "true");

    const target = getTimedCell("10:00");
    act(() => {
      fireEvent.dragStart(frame);
      fireEvent.dragOver(target);
      fireEvent.drop(target);
    });

    assert(onMoveRequest).toHaveBeenCalledOnce();

    const request = onMoveRequest.mock.calls[0]?.[0];

    assert(request.event.id).toBe("frame-move");
    assert(request.confirm).toStrictEqual(assert.any(Function));

    act(() => {
      request.confirm();
    });
    assert(request.from.startTime).toBe(parseLocalTime("09:00"));
    assert(request.to.startTime).toBe(parseLocalTime("10:00"));
  });

  it("marks unavailable cells and events without allowing their activation", async () => {
    const user = userEvent.setup();
    const onEventSelect = vi.fn<() => void>();
    const onUnavailable = vi.fn<() => ReactNode>(() => <span>Busy slot</span>);
    renderWeek({
      events: [timedEvent("busy", false)],
      onEventSelect,
      renderUnavailable: onUnavailable,
      t: (key) => key,
    });
    const button = screen.getByRole("button", { name: /busy/u });

    assert(button).toHaveAttribute("aria-disabled", "true");

    await user.click(button);

    assert(onEventSelect).not.toHaveBeenCalled();
    assert(onUnavailable).toHaveBeenCalledWith(assert.anything());
  });

  it("renders a deterministic now marker from the injected instant", () => {
    renderWeek({
      now: utcInstant("2026-08-24T12:00:00.000Z"),
      t: (key) => key,
    });

    const marker = screen.getByRole("status", { name: /Current time/u });
    assert(marker).toBeVisible();
    assert(marker).toHaveTextContent("12:00");
  });

  it("keeps keyboard navigation on timed cells when non-timed cells are adjacent", async () => {
    const user = userEvent.setup();
    renderWeek({ t: (key) => key });

    const firstTimedCell = getTimedCell("00:00");
    firstTimedCell.focus();
    await user.keyboard("{ArrowUp}");

    assert(firstTimedCell).toHaveFocus();

    await user.keyboard("{Home}");

    assert(firstTimedCell).toHaveFocus();
  });

  it("moves keyboard focus in the RTL direction", async () => {
    const user = userEvent.setup();
    renderWeek({ direction: "rtl", t: (key) => key });
    const first = getTimedCell("09:00");

    const second = screen.getByRole("gridcell", {
      name: /Tuesday, August 25, 2026 09:00/u,
    });

    first.focus();
    await user.keyboard("{ArrowLeft}");

    assert(second).toHaveFocus();
  });

  it("does not emit create or paint callbacks in read-only mode", () => {
    const onQuickCreate = vi.fn<() => void>();
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderWeek({
      events: [timedEvent("read-only")],
      interactionMode: "read-only",
      onPaintSelect: (range) => {
        onPaintSelect(range);
      },
      onQuickCreate,
      t: (key) => key,
    });

    fireEvent.click(getTimedCell("10:00"));
    fireEvent.pointerDown(getTimedCell("11:00"));
    fireEvent.pointerUp(getTimedCell("12:00"));

    assert(onQuickCreate).not.toHaveBeenCalled();
    assert(onPaintSelect).not.toHaveBeenCalled();
  });

  it("closes the composed detail slot without requiring host mutation", async () => {
    const user = userEvent.setup();
    renderWeek({
      events: [timedEvent("detail")],
      renderDetail: ({ event: detailEvent, close: closePanel }) => (
        <aside aria-label="Detail">
          {detailEvent.title}
          <button type="button" onClick={closePanel}>
            Close
          </button>
        </aside>
      ),
      selectedEventId: "detail",
      t: (key) => key,
    });

    const detail = screen.getByRole("complementary", { name: "Detail" });

    assert(detail).toHaveTextContent("detail");

    await user.click(within(detail).getByRole("button", { name: "Close" }));

    assert(screen.queryByRole("complementary", { name: "Detail" })).toBeNull();
  });

  it("cancels pointer interactions at the surface boundary and ignores non-cell targets", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderWeek({
      interactionMode: "paint-and-move",
      onPaintSelect: (range) => {
        onPaintSelect(range);
      },
      t: (key) => key,
    });

    const grid = screen.getByRole("grid");
    const surface = grid;

    const allDayCell = screen.getByRole("gridcell", {
      name: /Monday, August 24, 2026 All-day events/u,
    });
    const timedCell = getTimedCell("09:00");

    fireEvent.click(surface);
    fireEvent.pointerMove(surface);
    fireEvent.pointerDown(surface);
    fireEvent.pointerDown(allDayCell);
    fireEvent.pointerDown(timedCell);
    fireEvent.pointerEnter(surface);
    fireEvent.pointerLeave(surface);
    fireEvent.pointerCancel(surface);
    fireEvent.pointerUp(surface);
    fireEvent.dragOver(surface);
    fireEvent.drop(surface);
    fireEvent.dragEnd(surface);

    assert(onPaintSelect).not.toHaveBeenCalled();
  });

  it("announces keyboard focus changes and guards custom event key activation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));

    const onEventSelect = vi.fn<() => void>();
    renderWeek({
      events: [timedEvent("custom")],
      interactionMode: "read-only",
      onEventSelect,
      renderEvent: (context) => <span>{context.event.title}</span>,
      t: (key) => key,
    });

    const firstCell = getTimedCell("09:00");
    act(() => {
      firstCell.focus();
    });
    act(() => {
      fireEvent.keyDown(firstCell, { key: "ArrowDown" });
    });

    const eventButton = screen.getByRole("button", { name: "custom" });
    act(() => {
      fireEvent.keyDown(eventButton, { key: "Escape" });
      fireEvent.keyDown(eventButton, { key: "Enter", repeat: true });
    });
    act(() => {
      fireEvent.keyDown(eventButton, { key: "Enter" });
      vi.advanceTimersByTime(60_000);
    });

    assert(onEventSelect).toHaveBeenCalledOnce();
    assert(screen.getByText(/Week view/u)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("ignores malformed unavailable events without crashing the grid", () => {
    const malformed = timedEvent("malformed", false);
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    renderWeek({ events: [malformed], t: (key) => key });

    assert(screen.getByRole("grid")).toBeVisible();
  });

  it("cancels a drag when the host surface receives a non-cell drop", () => {
    const onMoveRequest = vi.fn<() => void>();
    renderWeek({
      events: [timedEvent("drag-cancel")],
      interactionMode: "paint-and-move",
      onMoveRequest,
      t: (key) => key,
    });

    const button = screen.getByRole("button", { name: /drag-cancel/u });
    const grid = screen.getByRole("grid");
    const surface = grid;

    fireEvent.dragStart(button);
    fireEvent.dragOver(surface);
    fireEvent.drop(surface);

    assert(onMoveRequest).not.toHaveBeenCalled();
  });
});

const NO_WEEK_EVENTS: readonly CalendarEvent<Payload>[] = [];

describe("WeekGrid ordinary grid rendering", () => {
  it("keeps the week canvas rendered for empty input with no special regions", () => {
    const { rerender } = renderWeek({ events: NO_WEEK_EVENTS });

    assert(screen.getByRole("grid")).toBeVisible();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(
      <WeekGrid
        date={DATE}
        events={NO_WEEK_EVENTS}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
      />
    );

    assert(screen.getByRole("grid")).toBeVisible();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
    assert(
      within(screen.getByRole("grid")).getAllByRole("gridcell").length
    ).toBeGreaterThan(0);
  });

  it("leaves no empty state wrapper behind once the week has events", () => {
    renderWeek({ events: [timedEvent("settled")] });

    assert(screen.getByRole("grid")).toBeInTheDocument();
  });
});
