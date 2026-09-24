import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { parseIanaTimeZone, utcInstant } from "../../../core/model";
import type { CalendarWorldClock, IanaTimeZone } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { WorldClocks } from "../world-clocks";
import type { WorldClocksProps } from "../world-clocks";

const NOW = utcInstant("2026-08-24T13:59:00.000Z");

const BERLIN = parseIanaTimeZone("Europe/Berlin");
const SINGAPORE = parseIanaTimeZone("Asia/Singapore");
const LONDON = parseIanaTimeZone("Europe/London");

const INVALID_STORED_ZONE = Object.assign("Mars/Olympus_Mons", {
  __brand: "IanaTimeZone" as const,
});

const baseProps = (
  overrides: Partial<WorldClocksProps> = {}
): WorldClocksProps => ({
  availableTimeZoneIds: [BERLIN, SINGAPORE, LONDON],
  direction: "ltr",
  now: NOW,
  onChange: vi.fn<() => void>(),
  t,
  timeZoneIds: [BERLIN, SINGAPORE],
  ...overrides,
});

describe(WorldClocks, () => {
  it("renders each clock with its city, local time, and offset from now", () => {
    render(<WorldClocks {...baseProps()} />);

    expect(screen.getByRole("region", { name: "World clocks" })).toBeVisible();
    expect(screen.getByText("Berlin")).toBeVisible();
    expect(screen.getByText("15:59 GMT+2")).toBeVisible();
    expect(screen.getByText("Singapore")).toBeVisible();
    expect(screen.getByText("21:59 GMT+8")).toBeVisible();
  });

  it("ticks on the minute when the host leaves now out", () => {
    vi.useFakeTimers({ now: new Date("2026-08-24T13:59:30.000Z") });

    try {
      const { now: _now, ...props } = baseProps();
      render(<WorldClocks {...props} />);

      expect(screen.getByText("15:59 GMT+2")).toBeVisible();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(screen.getByText("16:00 GMT+2")).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops stale stored zones without breaking the remaining clocks", () => {
    render(
      <WorldClocks
        {...baseProps({ timeZoneIds: [BERLIN, INVALID_STORED_ZONE] })}
      />
    );

    expect(screen.getByText("Berlin")).toBeVisible();
    expect(screen.queryByText("Olympus Mons")).toBeNull();
  });

  it("keeps editing controls hidden until edit mode is entered", async () => {
    render(<WorldClocks {...baseProps()} />);

    expect(
      screen.queryByRole("button", { name: "Remove clock Berlin" })
    ).toBeNull();

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      screen.getByRole("button", { name: "Remove clock Berlin" })
    ).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Add clock" })).toBeVisible();
  });

  it("disables moves at the ends and emits the complete reordered list", async () => {
    const onChange = vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>();

    render(<WorldClocks {...baseProps({ onChange })} />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      screen.getByRole("button", { name: "Move up Berlin" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move down Singapore" })
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Move down Berlin" }));

    expect(onChange).toHaveBeenCalledWith([SINGAPORE, BERLIN]);
  });

  it("emits the complete remaining list when a clock is removed", async () => {
    const onChange = vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>();

    render(<WorldClocks {...baseProps({ onChange })} />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(
      screen.getByRole("button", { name: "Remove clock Berlin" })
    );

    expect(onChange).toHaveBeenCalledWith([SINGAPORE]);
  });

  it("offers the whole directory and disables clocks already listed", async () => {
    render(<WorldClocks {...baseProps()} />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Add clock" }));

    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(
      screen.getByRole("option", { name: "Berlin, Bratislava, Belgrade" })
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("option", { name: "Singapore, Kuala Lumpur, Manila" })
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("option", { name: "London, Lisbon, Paris" })
    ).not.toHaveAttribute("aria-disabled", "true");

    fireEvent.click(
      screen.getByRole("option", { name: "London, Lisbon, Paris" })
    );
  });

  it("emits an added zone from the ordinary empty clock list", async () => {
    const onChange = vi.fn<(timeZoneIds: readonly IanaTimeZone[]) => void>();

    render(
      <WorldClocks
        {...baseProps({
          onChange,
          timeZoneIds: [],
        })}
      />
    );

    expect(screen.getByRole("region")).toBeInTheDocument();

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Add clock" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Berlin, Bratislava, Belgrade" })
    );

    expect(onChange).toHaveBeenCalledWith([BERLIN]);
  });

  it("passes available and selected ids to the renderEditor slot in edit mode", async () => {
    render(
      <WorldClocks
        {...baseProps({
          renderEditor: (
            available: readonly IanaTimeZone[],
            selected: readonly IanaTimeZone[]
          ) => <span>{`${available.length}:${selected.length}`}</span>,
        })}
      />
    );

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("3:2")).toBeVisible();
  });

  it("allows clock content to be replaced by the renderClock slot", () => {
    render(
      <WorldClocks
        {...baseProps({
          renderClock: (clock: CalendarWorldClock) => (
            <span>{`custom-${clock.city}-${clock.time}`}</span>
          ),
        })}
      />
    );

    expect(screen.getByText("custom-Berlin-15:59")).toBeVisible();
    expect(screen.getByText("custom-Singapore-21:59")).toBeVisible();
  });
});
