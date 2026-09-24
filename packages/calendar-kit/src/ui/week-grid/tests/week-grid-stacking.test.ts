import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { declarations } from "../../../__test-utils__/css-declarations";
import { cssZIndex } from "../../../__test-utils__/css-z-index";
import {
  timedEvent,
  UTC,
  identityTranslate as t,
} from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

import nowLineCss from "../../../styles/modules/now-line.module.css?raw";
import weekGridCss from "../week-grid.module.css?raw";

const DATE = calendarDate("2026-08-24");

describe("week surface stacking acceptance pins", () => {
  it("keeps the now line above every rendered event frame", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));

    render(
      createElement(WeekGrid, {
        date: DATE,
        direction: "ltr",
        events: [
          timedEvent("overlap-first", "11:00", "13:00"),
          timedEvent("overlap-second", "11:00", "13:00"),
        ],
        locale: "en-US",
        t,
        timeZone: UTC,
      } satisfies WeekGridProps)
    );

    const renderedFrames = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-event-id][draggable="true"]'
      ),
    ].filter((frame) => frame.style.zIndex.length > 0);
    assert(renderedFrames.length).toBeGreaterThan(0);

    const frameZIndexes = renderedFrames.map((frame) =>
      Number(frame.style.zIndex)
    );
    assert(frameZIndexes.every((value) => Number.isFinite(value))).toBeTruthy();
    const highestFrameZIndex = Math.max(...frameZIndexes);
    const nowLineZIndex = cssZIndex(nowLineCss, ".nowLine");

    assert(nowLineZIndex).toBeGreaterThan(highestFrameZIndex);
    assert(
      screen.getByRole("status", { name: /Current time/u })
    ).toBeInTheDocument();
  });

  it("renders one surface-level now line across all day columns with a current-day emphasis segment", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));

    render(
      createElement(WeekGrid, {
        date: DATE,
        direction: "ltr",
        events: [],
        locale: "en-US",
        t,
        timeZone: UTC,
        visibleDays: 5,
      } satisfies WeekGridProps)
    );

    const nowLine = screen.getByRole("status", {
      name: /Current time/u,
    });
    assert(nowLine).toBeVisible();
    assert(
      screen.getAllByRole("status", { name: /Current time/u })
    ).toHaveLength(1);

    assert(
      nowLine.style.getPropertyValue("--cal-now-segment-inline-start")
    ).toBe("0%");
    assert(
      nowLine.style.getPropertyValue("--cal-now-segment-inline-size")
    ).toBe("20%");
    assert(
      declarations(weekGridCss, ".nowLine::after").get("inline-size")
    ).toBe("var(--cal-now-segment-inline-size, 0)");
  });
});
