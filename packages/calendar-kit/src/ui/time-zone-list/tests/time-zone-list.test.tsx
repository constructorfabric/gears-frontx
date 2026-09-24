import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { parseIanaTimeZone, utcInstant } from "../../../core/model";
import type { CalendarTimeZoneOption } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { TimeZoneList } from "../time-zone-list";
import type { TimeZoneListProps } from "../time-zone-list";

const JULY = utcInstant("2026-07-01T12:00:00.000Z");

const JANUARY = utcInstant("2026-01-01T12:00:00.000Z");

const OPTIONS: readonly CalendarTimeZoneOption[] = [
  { id: parseIanaTimeZone("Europe/London"), label: "London" },
  { id: parseIanaTimeZone("Europe/Berlin"), label: "Berlin" },
];

const baseProps = (
  overrides: Partial<TimeZoneListProps> = {}
): TimeZoneListProps => ({
  direction: "ltr",
  onSelectionChange: vi.fn<() => void>(),
  options: OPTIONS,
  referenceInstant: JULY,
  selectedTimeZoneId: null,
  t,
  ...overrides,
});

describe(TimeZoneList, () => {
  it("renders every supplied option with an offset calculated at the reference instant", () => {
    render(<TimeZoneList {...baseProps()} />);

    expect(screen.getByRole("region", { name: "Time zones" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /London.*GMT\+1/u })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Berlin.*GMT\+2/u })
    ).toBeVisible();
  });

  it("uses one supplied instant for all offsets and updates when that instant changes", () => {
    const { rerender } = render(<TimeZoneList {...baseProps()} />);

    expect(
      screen.getByRole("button", { name: /London.*GMT\+1/u })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Berlin.*GMT\+2/u })
    ).toBeVisible();

    rerender(<TimeZoneList {...baseProps({ referenceInstant: JANUARY })} />);

    expect(screen.getByRole("button", { name: /London.*GMT/u })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Berlin.*GMT\+1/u })
    ).toBeVisible();
  });

  it("selects an unselected zone and deselects the selected zone on re-selection", async () => {
    const onSelectionChange =
      vi.fn<(timeZoneId: (typeof OPTIONS)[number]["id"] | null) => void>();
    const { rerender } = render(
      <TimeZoneList {...baseProps({ onSelectionChange })} />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Berlin.*GMT\+2/u }));

    expect(onSelectionChange).toHaveBeenCalledWith("Europe/Berlin");

    rerender(
      <TimeZoneList
        {...baseProps({
          onSelectionChange,
          selectedTimeZoneId: parseIanaTimeZone("Europe/Berlin"),
        })}
      />
    );
    expect(
      screen.getByRole("button", { name: /Berlin.*GMT\+2/u })
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Berlin.*GMT\+2/u }));

    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it("passes option, shared offset, and selected state to the renderOption slot", () => {
    const renderOption = vi.fn<
      (
        option: CalendarTimeZoneOption,
        offset: string,
        selected: boolean
      ) => React.ReactNode
    >((option: CalendarTimeZoneOption, offset: string, selected: boolean) => (
      <span>{`${option.label}:${offset}:${selected ? "selected" : "available"}`}</span>
    ));

    render(
      <TimeZoneList
        {...baseProps({
          renderOption,
          selectedTimeZoneId: parseIanaTimeZone("Europe/Berlin"),
        })}
      />
    );

    expect(screen.getByText("Berlin:GMT+2:selected")).toBeVisible();
    expect(renderOption).toHaveBeenCalledWith(OPTIONS[0], "GMT+1", false);
    expect(renderOption).toHaveBeenCalledWith(OPTIONS[1], "GMT+2", true);
  });

  it("renders the ordinary list with no option rows when no zones are offered", () => {
    render(
      <TimeZoneList
        {...baseProps({
          options: [],
        })}
      />
    );

    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
