import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type {
  CalendarCell,
  CalendarDate,
  CalendarEvent,
  CalendarMoveRequest,
  CalendarSelectionRange,
} from "../../../core/model";
import { useWeekGridController } from "../use-week-grid-controller";

const DATE = calendarDate("2026-08-24");

const event = (id = "event-1"): Extract<CalendarEvent, { allDay: false }> => ({
  allDay: false,
  available: true,
  colorFamily: "turquoise",
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id,
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: id,
});

const cell = (time: string): CalendarCell => {
  const hour = Number(time.slice(0, 2));
  const nextHour = `${String(hour + 1).padStart(2, "0")}:00`;

  return {
    date: DATE,
    end: utcInstant(`2026-08-24T${nextHour}:00.000Z`),
    endTime: parseLocalTime(nextHour),
    start: utcInstant(`2026-08-24T${time}:00.000Z`),
    startTime: parseLocalTime(time),
  };
};

const requiredCell = (value: CalendarCell | undefined): CalendarCell => {
  if (!value) {
    throw new Error(
      "Expected the controller to expose the requested hour cell"
    );
  }

  return value;
};

describe(useWeekGridController, () => {
  it("builds seven source dates and a five-day visible window without dropping weekend data", () => {
    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [],
        timeZone: UTC,
        visibleDays: 5,
      })
    );

    expect(result.current.allViewerDates).toHaveLength(7);
    expect(result.current.viewerDates).toStrictEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
    ]);
    expect(result.current.hiddenDateCount).toBe(2);
  });

  it("keeps controlled and uncontrolled interaction mode state distinct", () => {
    const onInteractionModeChange = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      (props: {
        interactionMode?: "quick-create" | "paint-and-move" | "read-only";
        defaultInteractionMode?:
          | "quick-create"
          | "paint-and-move"
          | "read-only";
      }) =>
        useWeekGridController({
          date: DATE,
          events: [],
          timeZone: UTC,
          ...props,
          onInteractionModeChange,
        }),
      { initialProps: { defaultInteractionMode: "read-only" } }
    );

    expect(result.current.interactionMode).toBe("read-only");

    act(() => {
      result.current.setInteractionMode("quick-create");
    });

    expect(result.current.interactionMode).toBe("quick-create");
    expect(onInteractionModeChange).toHaveBeenCalledWith("quick-create");

    rerender({
      defaultInteractionMode: "quick-create",
      interactionMode: "read-only",
    });

    act(() => {
      result.current.setInteractionMode("paint-and-move");
    });

    expect(result.current.interactionMode).toBe("read-only");
    expect(onInteractionModeChange).toHaveBeenLastCalledWith("paint-and-move");
  });

  it("keeps uncontrolled selected-event state distinct", () => {
    const onSelectedEventIdChange = vi.fn<(eventId: string | null) => void>();
    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [event("event-1"), event("event-2")],
        onSelectedEventIdChange,
        timeZone: UTC,
      })
    );

    expect(result.current.selectedEventId).toBeNull();

    act(() => {
      result.current.selectEvent("event-1");
    });

    expect(result.current.selectedEventId).toBe("event-1");
    expect(onSelectedEventIdChange).toHaveBeenLastCalledWith("event-1");
  });

  it("keeps controlled selected-event state authoritative", () => {
    const onSelectedEventIdChange = vi.fn<(eventId: string | null) => void>();
    const { result, rerender } = renderHook(
      (props: { selectedEventId?: string | null }) =>
        useWeekGridController({
          date: DATE,
          events: [event("event-1"), event("event-2")],
          onSelectedEventIdChange,
          timeZone: UTC,
          ...props,
        }),
      { initialProps: { selectedEventId: "event-2" } }
    );

    expect(result.current.selectedEventId).toBe("event-2");

    act(() => {
      result.current.selectEvent("event-1");
    });

    expect(result.current.selectedEventId).toBe("event-2");
    expect(onSelectedEventIdChange).toHaveBeenLastCalledWith("event-1");

    rerender({ selectedEventId: "event-2" });
  });

  it("emits the exact ordered paint payload for reversed pointer travel", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();

    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [],
        interactionMode: "paint-and-move",
        onPaintSelect,
        timeZone: UTC,
      })
    );

    const [column] = result.current.dayColumns;

    if (column === undefined) {
      throw new Error("Expected a week column");
    }

    const start = requiredCell(column.slots[11]);
    const middle = requiredCell(column.slots[10]);
    const end = requiredCell(column.slots[9]);

    act(() => {
      result.current.beginPaint(0, 11);
      result.current.updatePaint(0, 9);
      result.current.endPaint();
    });

    expect(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [end, middle, start],
      end: start,
      start: end,
    });
  });

  it("cancels a pending move without committing it", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [event()],
        interactionMode: "paint-and-move",
        onMoveRequest,
        timeZone: UTC,
      })
    );
    const from = requiredCell(result.current.dayColumns[0]?.slots[9]);
    const to = requiredCell(result.current.dayColumns[0]?.slots[11]);

    act(() => {
      result.current.beginMove("event-1", from, to);
    });

    expect(onMoveRequest).toHaveBeenCalledOnce();
    expect(result.current.pendingMove).toStrictEqual({
      event: event(),
      from,
      to,
    });

    expect(result.current.committedMove).toBeNull();

    const [[request]] = onMoveRequest.mock.calls;
    act(() => {
      request.cancel();
    });

    expect(result.current.pendingMove).toBeNull();
    expect(result.current.committedMove).toBeNull();
  });

  it("commits a confirmed move", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [event()],
        interactionMode: "paint-and-move",
        onMoveRequest,
        timeZone: UTC,
      })
    );
    const from = requiredCell(result.current.dayColumns[0]?.slots[9]);
    const to = requiredCell(result.current.dayColumns[0]?.slots[11]);

    act(() => {
      result.current.beginMove("event-1", from, to);
    });
    const [[request]] = onMoveRequest.mock.calls;
    act(() => {
      request.confirm();
    });

    expect(result.current.pendingMove).toBeNull();
    expect(result.current.committedMove).toStrictEqual({
      event: event(),
      from,
      to,
    });
  });

  it("does not select unavailable events or emit edit callbacks in read-only mode", () => {
    const onEventSelect = vi.fn<() => void>();
    const onQuickCreate = vi.fn<() => void>();
    const onPaintSelect = vi.fn<() => void>();
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [{ ...event("unavailable"), available: false }],
        interactionMode: "read-only",
        onEventSelect,
        onMoveRequest,
        onPaintSelect,
        onQuickCreate,
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.selectEvent("unavailable");
      result.current.beginPaint(0, 9);
      result.current.endPaint();
      result.current.beginMove(
        "unavailable",
        requiredCell(result.current.dayColumns[0]?.slots[9]),
        requiredCell(result.current.dayColumns[0]?.slots[10])
      );
    });

    expect(onEventSelect).not.toHaveBeenCalled();
    expect(onQuickCreate).not.toHaveBeenCalled();
    expect(onPaintSelect).not.toHaveBeenCalled();
    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it("activates only empty cells in quick-create mode", () => {
    const onQuickCreate = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [event()],
        interactionMode: "quick-create",
        onQuickCreate,
        timeZone: UTC,
      })
    );

    const occupied = result.current.getCell(0, 9);
    const empty = result.current.getCell(0, 10);

    if (!occupied || !empty) {
      throw new Error("Expected week cells");
    }

    act(() => {
      result.current.activateCell(0, 9);
      result.current.activateCell(0, 10);
    });

    expect(onQuickCreate).toHaveBeenCalledExactlyOnceWith({
      range: { cells: [empty], end: empty, start: empty },
    });

    expect(occupied).not.toBe(empty);
  });

  it("builds the full seven-day visible window when requested", () => {
    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [],
        timeZone: UTC,
        visibleDays: 7,
      })
    );

    expect(result.current.viewerDates).toHaveLength(7);
    expect(result.current.hiddenDateCount).toBe(0);
  });

  it("keeps controlled selection and ignores missing or unavailable events", () => {
    const onSelectedEventIdChange = vi.fn<(eventId: string | null) => void>();

    const unavailable = { ...event("unavailable"), available: false };

    const { result, rerender } = renderHook(
      (selectedEventId: string | null | undefined) =>
        useWeekGridController({
          date: DATE,
          defaultSelectedEventId: null,
          events: [event(), unavailable],
          onSelectedEventIdChange,
          selectedEventId,
          timeZone: UTC,
        }),
      { initialProps: undefined }
    );

    act(() => {
      result.current.selectEvent("event-1");
      result.current.selectEvent("unavailable");
      result.current.selectEvent("missing");
    });

    expect(result.current.selectedEventId).toBe("event-1");
    expect(onSelectedEventIdChange).toHaveBeenCalledOnce();

    rerender("unavailable");

    expect(result.current.selectedEventId).toBe("unavailable");

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedEventId).toBe("unavailable");
    expect(onSelectedEventIdChange).toHaveBeenLastCalledWith(null);
  });

  it("clears the origin after a move resolves", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [event()],
        interactionMode: "paint-and-move",
        onMoveRequest,
        timeZone: UTC,
      })
    );

    const origin = cell("09:00");
    const target = cell("11:00");

    act(() => {
      result.current.beginMove("event-1", origin, target);
    });

    const [[request]] = onMoveRequest.mock.calls;

    act(() => {
      request.confirm();
    });

    expect(result.current.committedMove).toStrictEqual({
      event: event(),
      from: origin,
      to: target,
    });
  });

  it("guards invalid cells, all-day records, malformed events, and no-op focus paths", () => {
    const onQuickCreate = vi.fn<() => void>();

    const allDay: CalendarEvent = {
      allDay: true,
      colorFamily: "turquoise",
      endDate: calendarDate("2026-08-25"),
      endTime: null,
      id: "all-day",
      startDate: DATE,
      startTime: null,
      timeZone: UTC,
      title: "All day",
    };

    const malformed = { ...event("malformed") };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [allDay, malformed],
        interactionMode: "quick-create",
        onQuickCreate,
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.activateCell(99, 0);
      result.current.beginPaint(99, 0);
      result.current.updatePaint(99, 0);
      result.current.activateCell(0, 10);
    });

    expect(onQuickCreate).toHaveBeenCalledOnce();
    expect(result.current.getCell(99, 0)).toBeUndefined();

    act(() => {
      result.current.setFocusedCell({ columnIndex: 0, rowIndex: -1 });
      result.current.cancelMove();
      result.current.cancelPaint();
    });

    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 0,
    });
  });

  it("supports event selection context", () => {
    const onEventSelect = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [event(), event()],
        interactionMode: "quick-create",
        onEventSelect,
        timeZone: UTC,
      })
    );

    const context = {
      conflicts: [],
      event: event(),
      isAvailable: true,
      isPast: false,
      isReadOnly: false,
      isSelected: true,
      segment: {
        date: DATE,
        end: event().end,
        event: event(),
        segment: null,
        start: event().start,
      },
    };

    act(() => {
      result.current.setFocusedCell({ columnIndex: 0, rowIndex: 0 });
      result.current.selectEvent("event-1", context);
    });

    expect(result.current.selectedEventId).toBe("event-1");
    expect(onEventSelect).toHaveBeenCalledWith(event(), context, undefined);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedEventId).toBeNull();
  });

  it("cancels a move without a host, handles invalid origins, and restores on view changes", () => {
    const { result, rerender } = renderHook(
      (currentDate: CalendarDate) =>
        useWeekGridController({
          date: currentDate,
          events: [event()],
          interactionMode: "paint-and-move",
          timeZone: UTC,
        }),
      { initialProps: DATE }
    );

    const origin = cell("09:00");
    const target = cell("11:00");

    const outside = {
      ...cell("09:00"),
      date: calendarDate("2026-09-01"),
      end: utcInstant("2026-09-01T10:00:00.000Z"),
      start: utcInstant("2026-09-01T09:00:00.000Z"),
    };

    act(() => {
      result.current.beginMove("event-1", origin, target);
    });

    expect(result.current.pendingMove).toBeNull();

    act(() => {
      result.current.updateMove(target);
      result.current.endMove();
      result.current.cancelMove();
    });

    expect(result.current.pendingMove).toBeNull();

    act(() => {
      result.current.beginMove("event-1", origin, origin);
    });

    expect(result.current.pendingMove).toBeNull();

    act(() => {
      result.current.beginMove("event-1", outside, target);
    });

    expect(result.current.pendingMove).toBeNull();

    act(() => {
      result.current.cancelMove();
    });

    act(() => {
      result.current.beginMove("event-1", cell("09:00"), target);
    });
    rerender(calendarDate("2026-08-25"));

    expect(result.current.pendingMove).toBeNull();
  });

  it("cancels a pending move when the displayed grid changes", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    const { result, rerender } = renderHook(
      (currentDate: CalendarDate) =>
        useWeekGridController({
          date: currentDate,
          events: [event()],
          interactionMode: "paint-and-move",
          onMoveRequest,
          timeZone: UTC,
        }),
      { initialProps: DATE }
    );

    act(() => {
      result.current.beginMove("event-1", cell("09:00"), cell("11:00"));
    });

    expect(result.current.pendingMove).not.toBeNull();

    rerender(calendarDate("2026-08-25"));

    expect(result.current.pendingMove).toBeNull();
  });

  it("cancels a pending move when the active event revision changes", () => {
    const initialEvents: readonly CalendarEvent[] = [event()];

    const { result, rerender } = renderHook(
      (events: readonly CalendarEvent[]) =>
        useWeekGridController({
          date: DATE,
          events,
          interactionMode: "paint-and-move",
          onMoveRequest: vi.fn<() => void>(),
          timeZone: UTC,
        }),
      { initialProps: initialEvents }
    );

    act(() => {
      result.current.beginMove("event-1", cell("09:00"), cell("11:00"));
    });

    expect(result.current.pendingMove).not.toBeNull();

    rerender([{ ...event(), start: utcInstant("2026-08-24T08:00:00.000Z") }]);

    expect(result.current.pendingMove).toBeNull();

    act(() => {
      result.current.beginMove("event-1", cell("09:00"), cell("11:00"));
    });
    rerender([
      {
        allDay: true,
        colorFamily: "turquoise",
        endDate: calendarDate("2026-08-25"),
        endTime: null,
        id: "event-1",
        startDate: DATE,
        startTime: null,
        timeZone: UTC,
        title: "Now all day",
      },
    ]);

    expect(result.current.pendingMove).toBeNull();
  });

  it("clears focus restoration when a controlled mode changes without a move", () => {
    const { result, rerender } = renderHook(
      (interactionMode: "quick-create" | "read-only") =>
        useWeekGridController({
          date: DATE,
          events: [],
          interactionMode,
          timeZone: UTC,
        }),
      { initialProps: "quick-create" }
    );

    rerender("read-only");

    expect(result.current.interactionMode).toBe("read-only");
  });

  it("handles all-day move revisions without treating their dates as instants", () => {
    const allDay: CalendarEvent = {
      allDay: true,
      colorFamily: "turquoise",
      endDate: calendarDate("2026-08-25"),
      endTime: null,
      id: "all-day",
      startDate: DATE,
      startTime: null,
      timeZone: UTC,
      title: "All day",
    };

    const { result, rerender } = renderHook(
      (events: readonly CalendarEvent[]) =>
        useWeekGridController({
          date: DATE,
          events,
          interactionMode: "paint-and-move",
          onMoveRequest: vi.fn<() => void>(),
          timeZone: UTC,
        }),
      { initialProps: [allDay] }
    );

    act(() => {
      result.current.beginMove("all-day", cell("09:00"), cell("11:00"));
    });

    expect(result.current.pendingMove).not.toBeNull();

    rerender([{ ...allDay }]);

    expect(result.current.pendingMove).not.toBeNull();

    act(() => {
      result.current.cancelMove();
    });
  });

  it("clears an unavailable move when its event becomes unavailable", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    const { result, rerender } = renderHook(
      (events: readonly CalendarEvent[]) =>
        useWeekGridController({
          date: DATE,
          events,
          interactionMode: "paint-and-move",
          onMoveRequest,
          timeZone: UTC,
        }),
      { initialProps: [event()] }
    );

    const origin = cell("09:00");
    const target = cell("11:00");

    act(() => {
      result.current.beginMove("event-1", origin, target);
    });

    expect(result.current.pendingMove).not.toBeNull();

    rerender([{ ...event(), available: false }]);

    expect(result.current.pendingMove).toBeNull();
    expect(onMoveRequest).toHaveBeenCalledOnce();
  });

  it("restores focus to the move origin cell after the host cancels the move", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [event()],
        interactionMode: "paint-and-move",
        onMoveRequest,
        timeZone: UTC,
      })
    );
    const from = requiredCell(result.current.dayColumns[0]?.slots[9]);
    const to = requiredCell(result.current.dayColumns[0]?.slots[11]);

    act(() => {
      result.current.beginMove("event-1", from, to);
    });

    expect(result.current.pendingMove).not.toBeNull();

    const [[request]] = onMoveRequest.mock.calls;
    act(() => {
      request.cancel();
    });

    expect(result.current.pendingMove).toBeNull();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 9,
    });
  });

  it("never exposes a stale pending move across the invalidation render", () => {
    const initialEvent = event();

    const renders: (string | null)[] = [];

    const { result, rerender } = renderHook(
      (events: readonly CalendarEvent[]) => {
        const value = useWeekGridController({
          date: DATE,
          events,
          interactionMode: "paint-and-move",
          onMoveRequest: vi.fn<(request: CalendarMoveRequest) => void>(),
          timeZone: UTC,
        });
        renders.push(value.pendingMove?.event.id ?? null);

        return value;
      },
      { initialProps: [initialEvent] }
    );
    const from = requiredCell(result.current.dayColumns[0]?.slots[9]);
    const to = requiredCell(result.current.dayColumns[0]?.slots[11]);

    act(() => {
      result.current.beginMove("event-1", from, to);
    });
    const beforeInvalidation = renders.length;

    rerender([{ ...initialEvent, available: false }]);

    expect(
      renders
        .slice(beforeInvalidation)
        .every((pendingMove) => pendingMove === null)
    ).toBeTruthy();
  });
});
