import { act, renderHook } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { calendarDate } from "../../../core/model";
import type { CalendarDateRange } from "../../../core/model";
import { useDateRangeSelection } from "../use-date-range-selection";

const SEP_1 = calendarDate("2025-09-01");
const SEP_3 = calendarDate("2025-09-03");
const SEP_5 = calendarDate("2025-09-05");

const renderSelection = (defaultValue: CalendarDateRange | null = null) => {
  const onChange = vi.fn<(range: CalendarDateRange | null) => void>();
  const hook = renderHook(() =>
    useDateRangeSelection({ defaultValue, onChange })
  );

  return { hook, onChange };
};

describe(useDateRangeSelection, () => {
  it("commits a dragged range in either direction", () => {
    const { hook, onChange } = renderSelection();

    act(() => {
      hook.result.current.press(SEP_5);
    });
    act(() => {
      hook.result.current.hover(SEP_1);
    });

    assert(hook.result.current.range).toStrictEqual({
      end: SEP_5,
      start: SEP_1,
    });
    assert(onChange).not.toHaveBeenCalled();

    act(() => {
      hook.result.current.release(SEP_1);
    });

    assert(onChange).toHaveBeenCalledWith({ end: SEP_5, start: SEP_1 });
    assert(hook.result.current.anchor).toBeNull();
  });

  it("commits a range from two separate clicks", () => {
    const { hook, onChange } = renderSelection();

    act(() => {
      hook.result.current.press(SEP_1);
    });
    act(() => {
      hook.result.current.release(SEP_1);
    });

    assert(hook.result.current.anchor).toBe(SEP_1);
    assert(onChange).not.toHaveBeenCalled();

    act(() => {
      hook.result.current.hover(SEP_3);
    });
    act(() => {
      hook.result.current.press(SEP_3);
    });

    assert(onChange).toHaveBeenCalledWith({ end: SEP_3, start: SEP_1 });
  });

  it("anchors and commits from the keyboard, and cancels back to the committed range", () => {
    const committed = { end: SEP_3, start: SEP_1 };

    const { hook, onChange } = renderSelection(committed);

    act(() => {
      hook.result.current.activate(SEP_5);
    });
    act(() => {
      hook.result.current.hover(SEP_3);
    });

    assert(hook.result.current.range).toStrictEqual({
      end: SEP_5,
      start: SEP_3,
    });

    act(() => {
      hook.result.current.cancel();
    });

    assert(hook.result.current.range).toStrictEqual(committed);
    assert(onChange).not.toHaveBeenCalled();

    act(() => {
      hook.result.current.activate(SEP_1);
    });
    act(() => {
      hook.result.current.activate(SEP_1);
    });

    assert(onChange).toHaveBeenCalledWith({ end: SEP_1, start: SEP_1 });
  });

  it("ignores hover and release while no range is being picked", () => {
    const { hook, onChange } = renderSelection();

    act(() => {
      hook.result.current.hover(SEP_3);
      hook.result.current.release(SEP_3);
    });

    assert(hook.result.current.range).toBeNull();
    assert(onChange).not.toHaveBeenCalled();
  });
});
