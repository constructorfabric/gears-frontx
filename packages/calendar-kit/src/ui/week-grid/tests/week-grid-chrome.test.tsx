import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect as assert, it, vi } from "vitest";

import { calendarDate, parseIanaTimeZone } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

const DATE = calendarDate("2026-09-14");
const NEXT_DATE = calendarDate("2026-09-21");
const SOFIA = parseIanaTimeZone("Europe/Sofia");

const SCROLL_HEIGHT = 1200;
const WORKING_HOUR_OFFSET = 400;

const weekProps: WeekGridProps = {
  date: DATE,
  direction: "ltr",
  events: [],
  locale: "en-US",
  t,
  timeZone: SOFIA,
};

const renderWeek = (overrides: Partial<WeekGridProps> = {}) =>
  render(<WeekGrid {...weekProps} {...overrides} />);

const scrollHeightDescriptors = new Map<
  HTMLElement,
  PropertyDescriptor | undefined
>();

const stubScrollHeight = (element: HTMLElement, scrollHeight: number): void => {
  scrollHeightDescriptors.set(
    element,
    Object.getOwnPropertyDescriptor(element, "scrollHeight")
  );
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
};

const restoreScrollHeightDescriptors = (): void => {
  for (const [element, descriptor] of scrollHeightDescriptors) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(element, "scrollHeight");
    } else {
      Object.defineProperty(element, "scrollHeight", descriptor);
    }
  }

  scrollHeightDescriptors.clear();
};

const requireScrollContainer = (): HTMLElement => {
  const firstScrollableRow = within(screen.getByRole("grid"))
    .getAllByRole("row")
    .at(2);
  const surface = firstScrollableRow?.parentElement;

  if (!(surface instanceof HTMLElement)) {
    throw new Error(
      "Expected the week interaction surface under the grid rows"
    );
  }

  return surface;
};

const countScrollWrites = (element: HTMLElement): readonly number[] => {
  const writes: number[] = [];

  vi.spyOn(element, "scrollTop", "set").mockImplementation((value: number) => {
    writes.push(value);
  });

  return writes;
};

describe("WeekGrid week chrome", () => {
  afterEach(() => {
    restoreScrollHeightDescriptors();
    vi.restoreAllMocks();
  });

  it("labels the time gutter with the viewer zone offset instead of the translated word", () => {
    renderWeek();

    const [timeHeader] = within(screen.getByRole("grid")).getAllByRole(
      "columnheader"
    );

    assert(within(timeHeader).getByTitle(SOFIA)).toHaveTextContent("GMT+3");
    assert(screen.queryByText("Timezone")).toBeNull();
  });

  it("positions the week scroll container at the working hour on mount", () => {
    const { rerender } = renderWeek();
    const surface = requireScrollContainer();
    stubScrollHeight(surface, SCROLL_HEIGHT);

    rerender(<WeekGrid {...weekProps} date={NEXT_DATE} />);

    assert(surface.scrollTop).toBe(WORKING_HOUR_OFFSET);
  });

  it("repositions the surface for another week and never twice for the same one", () => {
    const { rerender } = renderWeek();
    const surface = requireScrollContainer();
    stubScrollHeight(surface, SCROLL_HEIGHT);
    const writes = countScrollWrites(surface);

    rerender(<WeekGrid {...weekProps} date={NEXT_DATE} />);

    assert(writes).toStrictEqual([WORKING_HOUR_OFFSET]);

    rerender(<WeekGrid {...weekProps} date={NEXT_DATE} visibleDays={7} />);

    assert(writes).toStrictEqual([WORKING_HOUR_OFFSET]);
  });
});
