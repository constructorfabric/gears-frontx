import { act, render, renderHook, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { UTC, identityTranslate as t } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import type { CalendarRef } from "../../../core/model";
import type { CalendarSidePanelProps as PanelProps } from "../../../ui/calendar-side-panel/calendar-side-panel";
import { useCalendarSidePanelController } from "../use-calendar-side-panel-controller";

type ControllerOptions = Parameters<typeof useCalendarSidePanelController>[0];

type ControllerResult = ReturnType<typeof useCalendarSidePanelController>;

const CALENDARS: readonly CalendarRef[] = [
  { colorFamily: "turquoise", id: "cal-courses", name: "Courses" },
];

const panelProps = (overrides: Partial<PanelProps> = {}): PanelProps => ({
  calendars: CALENDARS,
  direction: "ltr",
  events: [],
  hiddenCalendarIds: [],
  id: "calendar-side-panel",
  locale: "en-US",
  onClose: vi.fn<() => void>(),
  onHiddenCalendarIdsChange: vi.fn<() => void>(),
  onRevealEvent: vi.fn<() => void>(),
  onSelectedTimeZoneIdChange: vi.fn<() => void>(),
  onWorldClockTimeZoneIdsChange: vi.fn<() => void>(),
  open: true,
  selectedDate: calendarDate("2026-08-24"),
  selectedTimeZoneId: null,
  t,
  timeZone: UTC,
  worldClockTimeZoneIds: [],
  ...overrides,
});

const Harness = ({ options }: { readonly options: ControllerOptions }) => {
  const controller: ControllerResult = useCalendarSidePanelController(options);

  return createElement(
    "button",
    { onClick: controller.close, ref: controller.toggleRef, type: "button" },
    "Collapse"
  );
};

describe(useCalendarSidePanelController, () => {
  it("defaults to closed and seeds an uncontrolled default-open panel", () => {
    const closed = renderHook(() =>
      useCalendarSidePanelController(
        panelProps({ defaultOpen: undefined, open: undefined })
      )
    );

    expect(closed.result.current.isOpen).toBeFalsy();

    const open = renderHook(() =>
      useCalendarSidePanelController(
        panelProps({ defaultOpen: true, open: undefined })
      )
    );

    expect(open.result.current.isOpen).toBeTruthy();
  });

  it("closes uncontrolled state and reports both public close callbacks", () => {
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<(open: boolean) => void>();

    const { result } = renderHook(() =>
      useCalendarSidePanelController(
        panelProps({
          defaultOpen: true,
          onClose,
          onOpenChange,
          open: undefined,
        })
      )
    );

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBeFalsy();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("leaves controlled state to the caller while reporting a close intent", () => {
    const onClose = vi.fn<() => void>();
    const onOpenChange = vi.fn<(open: boolean) => void>();

    const { result, rerender } = renderHook(
      (options: PanelProps) => useCalendarSidePanelController(options),
      { initialProps: panelProps({ onClose, onOpenChange }) }
    );

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBeTruthy();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(panelProps({ onClose, onOpenChange, open: false }));

    expect(result.current.isOpen).toBeFalsy();
  });

  it("focuses the collapse control when an opened panel has no connected focus origin", () => {
    render(createElement(Harness, { options: panelProps() }));

    expect(screen.getByRole("button", { name: "Collapse" })).toHaveFocus();
  });
});
