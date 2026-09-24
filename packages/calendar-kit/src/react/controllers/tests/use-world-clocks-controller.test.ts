import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseIanaTimeZone, utcInstant } from "../../../core/model";
import type {
  CalendarWorldClock,
  IanaTimeZone,
  UtcInstant,
} from "../../../core/model";
import { useWorldClocksController } from "../use-world-clocks-controller";

type ControllerOptions = Parameters<typeof useWorldClocksController>[0];

const BERLIN = parseIanaTimeZone("Europe/Berlin");
const SINGAPORE = parseIanaTimeZone("Asia/Singapore");
const LONDON = parseIanaTimeZone("Europe/London");

const NOW = utcInstant("2026-08-24T13:59:00.000Z");

const storedTimeZoneIds = (ids: readonly string[]): readonly IanaTimeZone[] =>
  ids.filter((id): id is IanaTimeZone => id !== "");

const INVALID_STORED_ZONES = storedTimeZoneIds([BERLIN, "Mars/Olympus_Mons"]);

const renderController = (overrides: Partial<ControllerOptions> = {}) => {
  const onChange = vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>();

  const options: ControllerOptions = {
    availableTimeZoneIds: [BERLIN, SINGAPORE],
    locale: "en-US",
    now: NOW,
    onChange,
    timeZoneIds: [BERLIN],
    ...overrides,
  };

  return renderHook(() => useWorldClocksController(options));
};

describe(useWorldClocksController, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("silently drops an invalid stored zone and preserves valid order", () => {
    const { result } = renderController({
      timeZoneIds: INVALID_STORED_ZONES,
    });

    expect(
      result.current.clocks.map((clock: CalendarWorldClock) => clock.timeZoneId)
    ).toStrictEqual([BERLIN]);
  });

  it("does not emit a duplicate add and computes addable zones by set difference", () => {
    const onChange = vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>();

    const { result } = renderController({
      availableTimeZoneIds: [BERLIN, SINGAPORE, LONDON],
      onChange,
    });

    expect(result.current.addableTimeZoneIds).toStrictEqual([
      SINGAPORE,
      LONDON,
    ]);

    act(() => {
      result.current.addClock(BERLIN);
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      result.current.addClock(SINGAPORE);
    });

    expect(onChange).toHaveBeenCalledWith([BERLIN, SINGAPORE]);
  });

  it("rejects moves beyond either list end and emits valid reorderings", () => {
    const onChange = vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>();

    const { result } = renderController({
      onChange,
      timeZoneIds: [BERLIN, SINGAPORE],
    });

    act(() => {
      result.current.moveClock(BERLIN, "earlier");
      result.current.moveClock(SINGAPORE, "later");
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      result.current.moveClock(BERLIN, "later");
    });

    expect(onChange).toHaveBeenCalledWith([SINGAPORE, BERLIN]);
  });

  it("emits the full ordered list when removing a clock", () => {
    const onChange = vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>();

    const { result } = renderController({
      onChange,
      timeZoneIds: [BERLIN, SINGAPORE],
    });

    act(() => {
      result.current.removeClock(BERLIN);
    });

    expect(onChange).toHaveBeenCalledWith([SINGAPORE]);
  });

  it("uses the supplied now instant for every displayed clock", () => {
    const { result, rerender } = renderHook(
      (options: ControllerOptions) => useWorldClocksController(options),
      {
        initialProps: {
          availableTimeZoneIds: [BERLIN],
          locale: "en-US",
          now: NOW,
          onChange: vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>(),
          timeZoneIds: [BERLIN],
        },
      }
    );

    expect(result.current.clocks[0]?.time).toBe("15:59");

    rerender({
      availableTimeZoneIds: [BERLIN],
      locale: "en-US",
      now: utcInstant("2026-08-24T14:00:00.000Z"),
      onChange: vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>(),
      timeZoneIds: [BERLIN],
    });

    expect(result.current.clocks[0]?.time).toBe("16:00");
  });

  it("ticks on the next minute boundary when now is not injected", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T13:59:40.000Z"));

    const { result } = renderHook(() =>
      useWorldClocksController({
        availableTimeZoneIds: [BERLIN],
        locale: "en-US",
        onChange: vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>(),
        timeZoneIds: [BERLIN],
      })
    );

    expect(result.current.clocks[0]?.time).toBe("15:59");

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(result.current.clocks[0]?.time).toBe("16:00");
  });

  it("renders locale and DST-sensitive world-clock labels", () => {
    const beforeTransition = utcInstant("2026-03-29T00:30:00.000Z");
    const afterTransition = utcInstant("2026-03-29T01:30:00.000Z");
    const onChange = vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>();
    const { result, rerender } = renderHook(
      (now: UtcInstant) =>
        useWorldClocksController({
          availableTimeZoneIds: [BERLIN],
          locale: "fr-FR",
          now,
          onChange,
          timeZoneIds: [BERLIN],
        }),
      { initialProps: beforeTransition }
    );

    expect(result.current.clocks[0]).toMatchObject({
      offset: "UTC+1",
      time: "01:30",
    });

    rerender(afterTransition);

    expect(result.current.clocks[0]).toMatchObject({
      offset: "UTC+2",
      time: "03:30",
    });
  });
});
