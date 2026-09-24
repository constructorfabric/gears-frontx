import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import {
  AGENDA_WINDOW_DAYS,
  addCalendarDays,
  calendarDate,
  parseIanaTimeZone,
} from "../../../core/model";
import type { CalendarView } from "../../../core/model";
import { useCalendarToolbarController } from "../use-calendar-toolbar-controller";
import type { UseCalendarToolbarControllerOptions } from "../use-calendar-toolbar-controller";

const DATE = calendarDate("2026-08-24");

const VIEWS: readonly CalendarView[] = ["day", "week", "month", "agenda"];

const scratchButtons: HTMLButtonElement[] = [];

const options = (
  overrides: Partial<UseCalendarToolbarControllerOptions> = {}
): UseCalendarToolbarControllerOptions => ({
  currentDate: DATE,
  direction: "ltr",
  locale: "en-US",
  onViewChange: () => {},
  timeZone: UTC,
  ...overrides,
});

interface RovingRadioProps {
  readonly onPress: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

const RovingRadio = ({ onPress }: RovingRadioProps) =>
  createElement("button", {
    "aria-label": "roving radio",
    onKeyDown: onPress,
    type: "button",
  });

const pressKey = async (
  user: ReturnType<typeof userEvent.setup>,
  indexRef: { current: number },
  key: string,
  index: number
): Promise<void> => {
  indexRef.current = index;

  const button = screen.getByRole("button", { name: "roving radio" });
  button.focus();
  await user.keyboard(`{${key}}`);
};

const createRadios = (): Map<CalendarView, HTMLButtonElement> => {
  const radios = new Map<CalendarView, HTMLButtonElement>();

  for (const view of VIEWS) {
    const button = document.createElement("button");
    button.type = "button";
    document.body.append(button);
    scratchButtons.push(button);
    radios.set(view, button);
  }

  return radios;
};

describe("useCalendarToolbarController active view state", () => {
  afterEach(() => {
    for (const button of scratchButtons) {
      button.remove();
    }

    scratchButtons.length = 0;
  });

  it("resolves the uncontrolled active view from defaultActiveView and defaults to day", () => {
    const { result } = renderHook(() =>
      useCalendarToolbarController(options())
    );

    expect(result.current.activeView).toBe("day");

    const seeded = renderHook(() =>
      useCalendarToolbarController(options({ defaultActiveView: "agenda" }))
    );

    expect(seeded.result.current.activeView).toBe("agenda");
  });

  it("reports view changes through onViewChange and updates uncontrolled state", () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();

    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ onViewChange }))
    );

    act(() => {
      result.current.selectView("week");
    });

    expect(onViewChange).toHaveBeenCalledWith("week");
    expect(result.current.activeView).toBe("week");
  });

  it("keeps the controlled active view authoritative while still reporting intent", () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();

    const { result, rerender } = renderHook(
      (opts: UseCalendarToolbarControllerOptions) =>
        useCalendarToolbarController(opts),
      { initialProps: options({ activeView: "week", onViewChange }) }
    );

    expect(result.current.activeView).toBe("week");

    act(() => {
      result.current.selectView("month");
    });

    expect(onViewChange).toHaveBeenCalledWith("month");
    expect(result.current.activeView).toBe("week");

    rerender(options({ activeView: "month", onViewChange }));

    expect(result.current.activeView).toBe("month");
  });
});

describe("useCalendarToolbarController title derivation", () => {
  afterEach(() => {
    for (const button of scratchButtons) {
      button.remove();
    }

    scratchButtons.length = 0;
  });

  it("derives the month and year title from the viewer-local current date", () => {
    const { result } = renderHook(() =>
      useCalendarToolbarController(options())
    );

    expect(result.current.titleMonth).toBe("August");
    expect(result.current.titleYear).toBe("2026");
  });

  it("interprets the current date in the viewer time zone at a month boundary", () => {
    const { result } = renderHook(() =>
      useCalendarToolbarController(
        options({
          currentDate: calendarDate("2026-08-31"),
          timeZone: parseIanaTimeZone("Pacific/Kiritimati"),
        })
      )
    );

    expect(result.current.titleMonth).toBe("August");
    expect(result.current.titleYear).toBe("2026");
  });

  it("formats the title in the supplied locale", () => {
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ locale: "fr-FR" }))
    );

    expect(result.current.titleMonth).toBe("août");
  });

  it("builds the agenda range over the 30-day window ending on its last day", () => {
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ activeView: "agenda" }))
    );

    expect(addCalendarDays(DATE, AGENDA_WINDOW_DAYS - 1)).toBe(
      calendarDate("2026-09-22")
    );

    expect(result.current.titleRange).toStrictEqual({
      endDay: "22",
      endMonth: "Sep",
      endYear: "2026",
      startDay: "24",
      startMonth: "Aug",
      startYear: "2026",
    });
  });

  it("spans the year boundary in the agenda range", () => {
    const start = calendarDate("2025-12-15");

    const { result } = renderHook(() =>
      useCalendarToolbarController(
        options({ activeView: "agenda", currentDate: start })
      )
    );

    expect(addCalendarDays(start, AGENDA_WINDOW_DAYS - 1)).toBe(
      calendarDate("2026-01-13")
    );

    expect(result.current.titleRange).toStrictEqual({
      endDay: "13",
      endMonth: "Jan",
      endYear: "2026",
      startDay: "15",
      startMonth: "Dec",
      startYear: "2025",
    });
  });

  it("returns a null agenda range outside the agenda view", () => {
    for (const view of ["day", "week", "month"] as const) {
      const { result } = renderHook(() =>
        useCalendarToolbarController(options({ activeView: view }))
      );

      expect(result.current.titleRange).toBeNull();
    }
  });

  it("never mutates the host date when the view changes", () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();

    const { result, rerender } = renderHook(
      (opts: UseCalendarToolbarControllerOptions) =>
        useCalendarToolbarController(opts),
      { initialProps: options({ defaultActiveView: "day", onViewChange }) }
    );

    const monthBefore = result.current.titleMonth;
    const yearBefore = result.current.titleYear;

    act(() => {
      result.current.selectView("agenda");
    });

    expect(onViewChange).toHaveBeenCalledWith("agenda");
    expect(result.current.titleMonth).toBe(monthBefore);
    expect(result.current.titleYear).toBe(yearBefore);
    expect(result.current.titleRange).toMatchObject({
      startDay: "24",
      startMonth: "Aug",
      startYear: "2026",
    });

    rerender(options({ defaultActiveView: "day", onViewChange }));

    expect(result.current.titleRange).toMatchObject({
      startDay: "24",
      startMonth: "Aug",
      startYear: "2026",
    });
  });
});

describe("useCalendarToolbarController roving keyboard model", () => {
  afterEach(() => {
    for (const button of scratchButtons) {
      button.remove();
    }

    scratchButtons.length = 0;
  });

  it("moves LTR roving selection with vertical and horizontal arrows", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ onViewChange }))
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    expect(result.current.availableViews).toStrictEqual([
      "day",
      "week",
      "month",
      "agenda",
    ]);
    await pressKey(user, indexRef, "ArrowRight", 0);
    expect(result.current.activeView).toBe("week");
    await pressKey(user, indexRef, "ArrowDown", 1);
    expect(result.current.activeView).toBe("month");
  });

  it("moves LTR roving selection back toward the start", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ onViewChange }))
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    await pressKey(user, indexRef, "ArrowRight", 0);
    await pressKey(user, indexRef, "ArrowDown", 1);
    await pressKey(user, indexRef, "ArrowUp", 2);
    expect(result.current.activeView).toBe("week");
    await pressKey(user, indexRef, "ArrowLeft", 1);
    expect(result.current.activeView).toBe("day");
  });

  it("wraps LTR roving selection at the start", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ onViewChange }))
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    await pressKey(user, indexRef, "ArrowRight", 0);
    await pressKey(user, indexRef, "ArrowDown", 1);
    await pressKey(user, indexRef, "ArrowUp", 2);
    await pressKey(user, indexRef, "ArrowLeft", 1);
    await pressKey(user, indexRef, "ArrowLeft", 0);
    expect(result.current.activeView).toBe("agenda");
  });

  it("reports each LTR roving transition in order", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ onViewChange }))
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    await pressKey(user, indexRef, "ArrowRight", 0);
    await pressKey(user, indexRef, "ArrowDown", 1);
    await pressKey(user, indexRef, "ArrowUp", 2);
    await pressKey(user, indexRef, "ArrowLeft", 1);
    await pressKey(user, indexRef, "ArrowLeft", 0);
    expect(onViewChange).toHaveBeenNthCalledWith(1, "week");
    expect(onViewChange).toHaveBeenNthCalledWith(2, "month");
    expect(onViewChange).toHaveBeenNthCalledWith(3, "week");
    expect(onViewChange).toHaveBeenNthCalledWith(4, "day");
    expect(onViewChange).toHaveBeenNthCalledWith(5, "agenda");
  });

  it("reverses horizontal arrows in RTL", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ direction: "rtl", onViewChange }))
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    await pressKey(user, indexRef, "ArrowLeft", 0);
    expect(result.current.activeView).toBe("week");
    await pressKey(user, indexRef, "ArrowRight", 1);
    expect(result.current.activeView).toBe("day");
    await pressKey(user, indexRef, "ArrowRight", 0);
    expect(result.current.activeView).toBe("agenda");
  });

  it("keeps vertical movement in RTL and reports the transitions", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ direction: "rtl", onViewChange }))
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    await pressKey(user, indexRef, "ArrowLeft", 0);
    await pressKey(user, indexRef, "ArrowRight", 1);
    await pressKey(user, indexRef, "ArrowRight", 0);
    await pressKey(user, indexRef, "ArrowDown", 3);
    expect(result.current.activeView).toBe("day");
    expect(onViewChange).toHaveBeenNthCalledWith(1, "week");
    expect(onViewChange).toHaveBeenNthCalledWith(2, "day");
    expect(onViewChange).toHaveBeenNthCalledWith(3, "agenda");
    expect(onViewChange).toHaveBeenNthCalledWith(4, "day");
  });

  it("selects the first and last available views on Home and End", async () => {
    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ defaultActiveView: "week" }))
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    await pressKey(user, indexRef, "Home", 1);
    expect(result.current.activeView).toBe("day");

    await pressKey(user, indexRef, "End", 0);
    expect(result.current.activeView).toBe("agenda");
  });

  it("ignores keys outside the roving model without reporting a change", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();

    const { result } = renderHook(() =>
      useCalendarToolbarController(options({ onViewChange }))
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    await pressKey(user, indexRef, "Enter", 0);
    await pressKey(user, indexRef, "Tab", 0);

    expect(result.current.activeView).toBe("day");
    expect(onViewChange).not.toHaveBeenCalled();
  });
});

describe("useCalendarToolbarController available views", () => {
  afterEach(() => {
    for (const button of scratchButtons) {
      button.remove();
    }

    scratchButtons.length = 0;
  });

  it("constrains available roving views", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { result } = renderHook(() =>
      useCalendarToolbarController(
        options({
          availableViews: ["day", "agenda"],
          defaultActiveView: "day",
          onViewChange,
        })
      )
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    expect(result.current.availableViews).toStrictEqual(["day", "agenda"]);
    await pressKey(user, indexRef, "ArrowRight", 0);
    expect(result.current.activeView).toBe("agenda");
    await pressKey(user, indexRef, "ArrowRight", 1);
    expect(result.current.activeView).toBe("day");
  });

  it("uses Home and End within the available views", async () => {
    const onViewChange = vi.fn<(view: CalendarView) => void>();
    const { result } = renderHook(() =>
      useCalendarToolbarController(
        options({
          availableViews: ["day", "agenda"],
          defaultActiveView: "day",
          onViewChange,
        })
      )
    );

    const indexRef = { current: 0 };

    const user = userEvent.setup();

    render(
      createElement(RovingRadio, {
        onPress: (event) => {
          result.current.handleViewKeyDown(event, indexRef.current);
        },
      })
    );

    await pressKey(user, indexRef, "End", 0);
    expect(result.current.activeView).toBe("agenda");
    await pressKey(user, indexRef, "Home", 1);
    expect(result.current.activeView).toBe("day");
    expect(onViewChange).toHaveBeenCalledTimes(2);
  });

  it("falls back to the first available view when the controlled view is unavailable", () => {
    const { result } = renderHook(() =>
      useCalendarToolbarController(
        options({ activeView: "week", availableViews: ["day", "agenda"] })
      )
    );

    expect(result.current.activeView).toBe("day");
  });
});

describe("useCalendarToolbarController focus management", () => {
  afterEach(() => {
    for (const button of scratchButtons) {
      button.remove();
    }

    scratchButtons.length = 0;
  });

  it("focuses the registered radio on selection and on controlled updates", () => {
    const { result, rerender } = renderHook(
      (opts: UseCalendarToolbarControllerOptions) =>
        useCalendarToolbarController(opts),
      { initialProps: options({ activeView: "week" }) }
    );

    const radios = createRadios();

    act(() => {
      for (const [view, button] of radios) {
        result.current.registerRadio(view, button);
      }
    });

    act(() => {
      result.current.selectView("month");
    });

    expect(document.activeElement).toBe(radios.get("month"));

    rerender(options({ activeView: "agenda" }));

    expect(document.activeElement).toBe(radios.get("agenda"));
  });

  it("tolerates an unregistered radio without throwing or moving focus", () => {
    const { result } = renderHook(() =>
      useCalendarToolbarController(options())
    );

    const radios = createRadios();

    act(() => {
      for (const [view, button] of radios) {
        result.current.registerRadio(view, button);
      }
    });

    const month = radios.get("month");

    act(() => {
      result.current.registerRadio("month", null);
    });

    expect(() => {
      act(() => {
        result.current.selectView("month");
      });
    }).not.toThrow();
    expect(document.activeElement).not.toBe(month);
  });
});
