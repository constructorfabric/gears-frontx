import { render } from "@testing-library/react";
import { afterEach, describe, expect as assert, it, vi } from "vitest";

import { UTC, identityTranslate as t } from "../../../__test-utils__/fixtures";
import { calendarDate, parseIanaTimeZone } from "../../../core/model";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

const DST_WEEK = calendarDate("2026-10-19");
const SOFIA = parseIanaTimeZone("Europe/Sofia");

const WORKING_HOUR_START_ROW = 8;
const SOFIA_HOUR_ROW_HEIGHT = 48;

const weekProps: WeekGridProps = {
  date: DST_WEEK,
  direction: "ltr",
  events: [],
  locale: "en-US",
  t,
  timeZone: UTC,
  visibleDays: 7,
};

const requireScrollSurface = (container: HTMLElement): HTMLElement => {
  const surface =
    container.firstElementChild?.firstElementChild?.firstElementChild;

  if (!(surface instanceof HTMLElement)) {
    throw new Error(
      "Expected the week interaction surface under the rendered wrapper"
    );
  }

  return surface;
};

const requireWrapper = (container: HTMLElement): HTMLElement => {
  const wrapper = container.firstElementChild;

  if (!(wrapper instanceof HTMLElement)) {
    throw new Error("Expected the wrapper this suite renders around the week");
  }

  return wrapper;
};

interface ScrollBox {
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

const setScrollBox = (element: HTMLElement, box: ScrollBox): void => {
  vi.spyOn(element, "scrollHeight", "get").mockReturnValue(box.scrollHeight);
  vi.spyOn(element, "clientHeight", "get").mockReturnValue(box.clientHeight);
};

const countScrollTopWrites = (element: HTMLElement): number[] => {
  const writes: number[] = [];

  vi.spyOn(element, "scrollTop", "get").mockReturnValue(0);
  vi.spyOn(element, "scrollTop", "set").mockImplementation((value: number) => {
    writes.push(value);
  });

  return writes;
};

const renderWeek = () =>
  render(
    <div>
      <WeekGrid {...weekProps} />
    </div>
  );

const rerenderWeek = (
  rerender: ReturnType<typeof render>["rerender"]
): void => {
  rerender(
    <div>
      <WeekGrid {...weekProps} timeZone={SOFIA} />
    </div>
  );
};

describe("WeekGrid working-hour scroll target", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves the surface, off that surface’s own height, once its rows overflow it", () => {
    const { container, rerender } = renderWeek();
    const surface = requireScrollSurface(container);
    const writes = countScrollTopWrites(surface);

    assert(writes).toStrictEqual([]);

    setScrollBox(surface, { clientHeight: 400, scrollHeight: 1200 });
    rerenderWeek(rerender);

    assert(writes).toStrictEqual([
      SOFIA_HOUR_ROW_HEIGHT * WORKING_HOUR_START_ROW,
    ]);
  });

  it("moves the week surface and leaves a taller overflowing ancestor alone", () => {
    const { container, rerender } = renderWeek();
    const surface = requireScrollSurface(container);
    const ancestorWrites = countScrollTopWrites(requireWrapper(container));
    const surfaceWrites = countScrollTopWrites(surface);

    setScrollBox(requireWrapper(container), {
      clientHeight: 400,
      scrollHeight: 2400,
    });
    setScrollBox(surface, { clientHeight: 400, scrollHeight: 1200 });
    rerenderWeek(rerender);

    assert(ancestorWrites).toStrictEqual([]);
    assert(surfaceWrites).toStrictEqual([
      SOFIA_HOUR_ROW_HEIGHT * WORKING_HOUR_START_ROW,
    ]);
  });
});
