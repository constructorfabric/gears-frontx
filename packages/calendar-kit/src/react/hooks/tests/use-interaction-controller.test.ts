import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type {
  CalendarCell,
  CalendarEvent,
  CalendarMoveRequest,
} from "../../../core/model";
import { useInteractionController } from "../use-interaction-controller";

const cell = (time: string): CalendarCell => {
  const hour = Number(time.slice(0, 2));
  const nextHour = `${String(hour + 1).padStart(2, "0")}:00`;

  return {
    date: calendarDate("2026-08-24"),
    end: utcInstant(`2026-08-24T${nextHour}:00.000Z`),
    endTime: parseLocalTime(nextHour),
    start: utcInstant(`2026-08-24T${time}:00.000Z`),
    startTime: parseLocalTime(time),
  };
};

const first = cell("09:00");
const second = cell("10:00");
const third = cell("11:00");

const event: CalendarEvent = {
  allDay: false,
  colorFamily: "turquoise",
  end: first.end,
  endDate: first.date,
  endTime: first.endTime,
  id: "event-1",
  start: first.start,
  startDate: first.date,
  startTime: first.startTime,
  timeZone: UTC,
  title: "Move me",
};

describe(useInteractionController, () => {
  it("gates paint and move actions in quick-create mode", () => {
    const onQuickCreate = vi.fn<() => void>();
    const onPaintSelect = vi.fn<() => void>();
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "quick-create",
        onMoveRequest,
        onPaintSelect,
        onQuickCreate,
      })
    );

    act(() => {
      result.current.beginPaint(first);
      result.current.beginMove(event, first, second);
    });

    expect(result.current.paint).toBeNull();
    expect(result.current.pendingMove).toBeNull();
  });

  it("activates a quick-create cell and rejects other callbacks", () => {
    const onQuickCreate = vi.fn<() => void>();
    const onPaintSelect = vi.fn<() => void>();
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "quick-create",
        onMoveRequest,
        onPaintSelect,
        onQuickCreate,
      })
    );

    let range = null;
    act(() => {
      range = result.current.activateCell(first);
    });

    expect(range).toStrictEqual({ cells: [first], end: first, start: first });

    expect(onQuickCreate).toHaveBeenCalledOnce();
    expect(onPaintSelect).not.toHaveBeenCalled();
    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it("emits one ordered paint range and safely handles invalid cancellation", () => {
    const onPaintSelect = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "paint-and-move",
        onPaintSelect,
      })
    );

    act(() => {
      result.current.beginPaint(third);
      result.current.updatePaint(first);
      result.current.endPaint();
      result.current.endPaint();
    });

    expect(result.current.paint).toStrictEqual({
      cells: [first, second, third],
      end: third,
      start: first,
    });
    expect(onPaintSelect).toHaveBeenCalledOnce();

    act(() => {
      result.current.cancelMove();
    });

    expect(result.current.pendingMove).toBeNull();
  });

  it("cancels a pending move without committing it", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "paint-and-move",
        onMoveRequest,
      })
    );

    act(() => {
      result.current.beginMove(event, first);
      result.current.updateMove(second);
      result.current.endMove();
    });

    expect(onMoveRequest).toHaveBeenCalledOnce();
    expect(result.current.pendingMove).toStrictEqual({
      event,
      from: first,
      to: second,
    });

    const [[request]] = onMoveRequest.mock.calls;
    act(() => {
      request.cancel();
    });

    expect(result.current.pendingMove).toBeNull();
    expect(result.current.committedMove).toBeNull();
  });

  it("commits a confirmed move and ignores a later cancel", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "paint-and-move",
        onMoveRequest,
      })
    );

    act(() => {
      result.current.beginMove(event, first, third);
      result.current.endMove();
    });

    const [[request]] = onMoveRequest.mock.calls;
    act(() => {
      request.confirm();
    });

    expect(result.current.pendingMove).toBeNull();
    expect(result.current.committedMove).toStrictEqual({
      event,
      from: first,
      to: third,
    });

    act(() => {
      request.cancel();
    });

    expect(result.current.committedMove).toStrictEqual({
      event,
      from: first,
      to: third,
    });
  });

  it("gates malformed quick-create cells and preserves an anchor rectangle", () => {
    const onQuickCreate = vi.fn<() => void>();

    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "quick-create",
        onQuickCreate,
      })
    );

    const malformed = { ...first };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });
    const anchor = new DOMRect(1, 2, 3, 4);

    expect(result.current.activateCell(malformed)).toBeNull();

    act(() => {
      result.current.activateCell(first, anchor);
    });

    expect(onQuickCreate).toHaveBeenCalledWith({
      anchorRect: anchor,
      range: { cells: [first], end: first, start: first },
    });
  });

  it("ignores repeated move requests and stale resolutions", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "paint-and-move",
        onMoveRequest,
      })
    );

    act(() => {
      result.current.beginMove(event, first, second);
    });
    act(() => {
      result.current.updateMove(third);
      result.current.endMove();
    });

    expect(onMoveRequest).toHaveBeenCalledOnce();
    expect(result.current.pendingMove).toStrictEqual({
      event,
      from: first,
      to: second,
    });

    const [[request]] = onMoveRequest.mock.calls;

    act(() => {
      request.cancel();
    });
    act(() => {
      request.confirm();
    });

    expect(result.current.pendingMove).toBeNull();
    expect(result.current.committedMove).toBeNull();
  });

  it("allows the controller method to confirm and starts the next interaction from idle", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "paint-and-move",
        onMoveRequest,
      })
    );

    act(() => {
      result.current.beginMove(event, first, second);
    });

    expect(result.current.pendingMove).not.toBeNull();

    act(() => {
      result.current.confirmMove();
    });

    expect(result.current.committedMove).toStrictEqual({
      event,
      from: first,
      to: second,
    });

    act(() => {
      result.current.beginPaint(third);
    });

    expect(result.current.committedMove).toBeNull();
    expect(result.current.paint).toStrictEqual({
      cells: [third],
      end: third,
      start: third,
    });
  });

  it("does not deadlock paint-and-move without a move callback", () => {
    const { result } = renderHook(() =>
      useInteractionController({ interactionMode: "paint-and-move" })
    );

    act(() => {
      result.current.beginMove(event, first, second);
    });

    expect(result.current.pendingMove).toBeNull();

    act(() => {
      result.current.beginMove(event, first, third);
      result.current.endMove();
    });

    expect(result.current.pendingMove).toBeNull();
  });

  it("supports controlled-to-uncontrolled interaction mode handoff", () => {
    const onInteractionModeChange = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      (options: {
        readonly interactionMode?: "quick-create" | "read-only";
        readonly defaultInteractionMode: "quick-create" | "read-only";
      }) =>
        useInteractionController({
          ...options,
          onInteractionModeChange,
        }),
      {
        initialProps: {
          defaultInteractionMode: "quick-create",
          interactionMode: "read-only",
        },
      }
    );

    expect(result.current.interactionMode).toBe("read-only");

    act(() => {
      result.current.setInteractionMode("quick-create");
    });

    expect(result.current.interactionMode).toBe("read-only");
    expect(onInteractionModeChange).toHaveBeenCalledWith("quick-create");

    rerender({
      defaultInteractionMode: "read-only",
      interactionMode: undefined,
    });

    expect(result.current.interactionMode).toBe("quick-create");
  });

  it("rejects busy-access move sources", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    const busyEvent = { ...event, access: "busy" as const };

    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "paint-and-move",
        onMoveRequest,
      })
    );

    act(() => {
      result.current.beginMove(busyEvent, first, second);
    });

    expect(result.current.pendingMove).toBeNull();
    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it("resets pending interaction state when the mode changes", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    const { result, rerender } = renderHook(
      (interactionMode: "paint-and-move" | "read-only") =>
        useInteractionController({ interactionMode, onMoveRequest }),
      { initialProps: "paint-and-move" }
    );

    act(() => {
      result.current.beginMove(event, first, second);
    });

    expect(result.current.pendingMove).not.toBeNull();

    rerender("read-only");

    expect(result.current.interactionMode).toBe("read-only");
    expect(result.current.pendingMove).toBeNull();
    expect(result.current.paint).toBeNull();

    act(() => {
      result.current.beginPaint(first);
      result.current.updatePaint(first);
      result.current.endPaint();
      result.current.endMove();
      result.current.activateCell(first);
      result.current.confirmMove();
      result.current.cancelMove();
    });

    expect(onMoveRequest).toHaveBeenCalledOnce();
  });

  it("ignores a stale move resolution after a later move starts", () => {
    const requests: CalendarMoveRequest[] = [];

    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>(
      (request) => {
        requests.push(request);
      }
    );
    const { result } = renderHook(() =>
      useInteractionController({
        interactionMode: "paint-and-move",
        onMoveRequest,
      })
    );

    act(() => {
      result.current.beginMove(event, first, second);
      result.current.cancelMove();
      result.current.beginMove(event, first, third);
    });

    expect(requests).toHaveLength(2);

    act(() => {
      requests[0]?.confirm();
    });

    expect(result.current.pendingMove?.to.startTime).toBe(
      parseLocalTime("11:00")
    );
    expect(result.current.committedMove).toBeNull();

    act(() => {
      requests[1]?.cancel();
    });

    expect(result.current.pendingMove).toBeNull();
  });
});
