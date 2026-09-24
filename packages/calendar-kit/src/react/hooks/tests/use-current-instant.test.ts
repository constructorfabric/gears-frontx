import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { utcInstant } from "../../../core/model";
import { useCurrentInstant } from "../use-current-instant";

const NOW = utcInstant("2026-08-24T13:59:40.000Z");

describe(useCurrentInstant, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aligns an uncontrolled minute clock to the next minute boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    const { result, unmount } = renderHook(() =>
      useCurrentInstant({ cadence: "minute-aligned" })
    );

    expect(result.current.currentInstant).toBe(NOW);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(result.current.currentInstant).toBe("2026-08-24T14:00:00.000Z");
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps controlled current-instant hooks timer-free", () => {
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useCurrentInstant({ cadence: "interval", intervalMs: 30_000, now: NOW })
    );

    expect(result.current.currentInstant).toBe(NOW);
    expect(vi.getTimerCount()).toBe(0);
  });
});
