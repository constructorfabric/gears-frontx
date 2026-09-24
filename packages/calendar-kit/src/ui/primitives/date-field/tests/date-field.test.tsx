import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import type { CalendarDate } from "../../../../core/model";
import { calendarDate } from "../../../../core/validation";
import { DateField } from "../date-field";

const START = calendarDate("2026-08-24");

const renderField = (props: Partial<Parameters<typeof DateField>[0]> = {}) =>
  render(
    <DateField
      aria-label="Start date"
      locale="en-US"
      value={START}
      onValueChange={() => {}}
      {...props}
    />
  );

const StatefulField = ({
  clearable = false,
  initialValue = START,
}: {
  readonly clearable?: boolean;
  readonly initialValue?: CalendarDate | "";
}) => {
  const [value, setValue] = useState<CalendarDate | "">(initialValue);

  return (
    <>
      <DateField
        aria-label="Start date"
        clearable={clearable}
        locale="en-US"
        value={value}
        onValueChange={setValue}
      />
      <output>{value === "" ? "empty" : value}</output>
    </>
  );
};

const field = (): HTMLInputElement => {
  const input = screen.getByLabelText("Start date");

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected a date field input");
  }

  return input;
};

describe(DateField, () => {
  it("renders the value as the locale's own date mask", () => {
    renderField();

    assert(field().value).toBe("08/24/2026");
  });

  it("shows the locale's placeholder mask while empty", () => {
    renderField({ locale: "de-DE", value: "" });

    assert(field().value).toBe("dd.mm.yyyy");
  });

  it("opens the calendar from the opener button and selects a day", async () => {
    const user = userEvent.setup();
    render(<StatefulField />);

    await user.click(screen.getByRole("button", { name: "Open calendar" }));

    const dialog = screen.getByRole("dialog", { name: "Choose date" });

    await user.click(
      within(dialog).getByRole("button", { name: /august 12, 2026/iu })
    );

    assert(screen.getByText("2026-08-12")).toBeInTheDocument();
    assert(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the calendar with Alt+ArrowDown", async () => {
    const user = userEvent.setup();
    renderField();

    await user.click(field());
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");

    assert(
      screen.getByRole("dialog", { name: "Choose date" })
    ).toBeInTheDocument();
  });

  it("commits a date typed segment by segment", async () => {
    const user = userEvent.setup();
    render(<StatefulField initialValue="" />);

    await user.click(field());
    await user.keyboard("09232026");

    assert(field().value).toBe("09/23/2026");
    assert(screen.getByText("2026-09-23")).toBeInTheDocument();
  });

  it("keeps the caret in the field while the clear control appears", async () => {
    const user = userEvent.setup();
    render(<StatefulField clearable initialValue="" />);

    await user.click(field());
    await user.keyboard("09232026");

    assert(
      screen.getByRole("button", { name: "Clear date" })
    ).toBeInTheDocument();
    assert(document.activeElement).toBe(field());
  });

  it("walks the mask segments with Tab and leaves the field from the last one", async () => {
    const user = userEvent.setup();
    renderField({ value: "" });

    const input = field();
    await user.click(input);

    assert([input.selectionStart, input.selectionEnd]).toStrictEqual([0, 2]);

    await user.keyboard("{Tab}");
    assert([input.selectionStart, input.selectionEnd]).toStrictEqual([3, 5]);

    await user.keyboard("{Tab}");
    assert([input.selectionStart, input.selectionEnd]).toStrictEqual([6, 10]);

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    assert([input.selectionStart, input.selectionEnd]).toStrictEqual([3, 5]);

    await user.keyboard("{Tab}{Tab}");
    assert(document.activeElement).not.toBe(input);
  });

  it("types into the segments in the locale's order", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: CalendarDate | "") => void>();
    renderField({ locale: "de-DE", onValueChange, value: "" });

    await user.click(field());
    await user.keyboard("23092026");

    assert(field().value).toBe("23.09.2026");
    assert(onValueChange).toHaveBeenLastCalledWith("2026-09-23");
  });

  it("steps the segment under the caret with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<StatefulField />);

    await user.click(field());
    await user.keyboard("{ArrowUp}");

    assert(screen.getByText("2026-09-24")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}{ArrowDown}");

    assert(screen.getByText("2026-09-23")).toBeInTheDocument();
  });

  it("ignores anything but digits", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: CalendarDate | "") => void>();
    renderField({ onValueChange });

    await user.type(field(), "Sep");

    assert(field().value).toBe("08/24/2026");
    assert(onValueChange).not.toHaveBeenCalled();
  });

  it("reads a pasted date written out in words", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: CalendarDate | "") => void>();
    renderField({ onValueChange, value: "" });

    await user.click(field());
    await user.paste("Sep 30, 2026");

    assert(onValueChange).toHaveBeenLastCalledWith("2026-09-30");
  });

  it("fills the mask from a pasted date", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: CalendarDate | "") => void>();
    renderField({ onValueChange, value: "" });

    await user.click(field());
    await user.paste("09/23/2026");

    assert(onValueChange).toHaveBeenLastCalledWith("2026-09-23");
  });

  it("clears an optional value from the field", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: CalendarDate | "") => void>();
    renderField({ clearable: true, onValueChange });

    await user.click(screen.getByRole("button", { name: "Clear date" }));

    assert(onValueChange).toHaveBeenCalledWith("");
  });

  it("offers no clear control until the field is clearable and filled", () => {
    const { unmount } = renderField();

    assert(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
    unmount();

    renderField({ clearable: true, value: "" });

    assert(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
  });

  it("exposes the invalid and disabled states", () => {
    const { unmount } = renderField({ invalid: true });

    assert(field()).toHaveAttribute("aria-invalid", "true");
    unmount();

    renderField({ disabled: true });

    assert(field()).toBeDisabled();
    assert(
      screen.getByRole("button", { name: "Open calendar" })
    ).toBeDisabled();
  });

  it("puts the picker ahead of the value and the clear control after it", () => {
    renderField({ clearable: true });

    const input = field();
    const clear = screen.getByRole("button", { name: "Clear date" });
    const opener = screen.getByRole("button", { name: "Open calendar" });
    const follows = Node.DOCUMENT_POSITION_FOLLOWING;

    assert(opener.compareDocumentPosition(input)).toBe(follows);
    assert(input.compareDocumentPosition(clear)).toBe(follows);
  });
});
