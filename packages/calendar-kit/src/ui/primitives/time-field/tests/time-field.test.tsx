import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { LocalTime } from "../../../../core/model";
import { timeOfDayIncrements } from "../../../../core/time-input";
import { parseLocalTime } from "../../../../core/validation";
import { TimeField } from "../time-field";

const halfHourOptions = timeOfDayIncrements({ stepMinutes: 30 });

const renderTimeField = (
  props: Partial<Parameters<typeof TimeField>[0]> = {}
) =>
  render(
    <TimeField
      aria-label="Start time"
      locale="de-DE"
      onValueChange={() => {}}
      options={halfHourOptions}
      value={parseLocalTime("10:00")}
      {...props}
    />
  );

const StatefulTimeField = (
  props: Partial<Parameters<typeof TimeField>[0]> = {}
) => {
  const [value, setValue] = useState<LocalTime>(parseLocalTime("10:00"));

  return (
    <TimeField
      aria-label="Start time"
      locale="de-DE"
      options={halfHourOptions}
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        props.onValueChange?.(next);
      }}
    />
  );
};

const input = (): HTMLInputElement => {
  const field = screen.getByRole("combobox", { name: "Start time" });

  if (!(field instanceof HTMLInputElement)) {
    throw new Error("Expected a time input");
  }

  return field;
};

describe("TimeField display", () => {
  it("opens around the nearest option for an off-grid value", async () => {
    renderTimeField({ value: parseLocalTime("10:10") });

    const user = userEvent.setup();
    await user.click(input());

    expect(screen.getByRole("listbox")).not.toBeNull();
    expect(input().getAttribute("aria-activedescendant")).toContain("10:00");
  });

  it("shows the committed value formatted for the locale", () => {
    renderTimeField();

    expect(input().value).toBe("10:00");
  });

  it("formats for a 12-hour locale", () => {
    renderTimeField({ locale: "en-US" });

    expect(input().value).toMatch(/10:00\s?AM/iu);
  });

  it("renders empty when there is no value", () => {
    renderTimeField({ value: "" });

    expect(input().value).toBe("");
  });
});

describe("TimeField panel", () => {
  it("stays closed until asked, then opens on click", async () => {
    renderTimeField();

    expect(screen.queryByRole("listbox")).toBeNull();

    const user = userEvent.setup();
    await user.click(input());

    screen.getByRole("listbox");
  });

  it("does not open on focus alone", async () => {
    renderTimeField();

    const user = userEvent.setup();
    await user.tab();

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens on ArrowDown", async () => {
    renderTimeField();

    const user = userEvent.setup();
    input().focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("listbox")).not.toBeNull();
  });

  it("offers one row per increment and marks the committed one", async () => {
    renderTimeField();

    const user = userEvent.setup();
    await user.click(input());

    expect(screen.getAllByRole("option")).toHaveLength(48);
    expect(
      screen
        .getByRole("option", { name: "10:00" })
        .getAttribute("aria-selected")
    ).toBe("true");
    expect(
      screen
        .getByRole("option", { name: "10:30" })
        .getAttribute("aria-selected")
    ).toBe("false");
  });

  it("wires the combobox to the popup", async () => {
    renderTimeField();

    const user = userEvent.setup();
    await user.click(input());
    const listbox = screen.getByRole("listbox");

    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(input().getAttribute("aria-controls")).toBe(listbox.id);
    expect(input().getAttribute("aria-autocomplete")).toBe("none");
    expect(input().getAttribute("aria-activedescendant")).toBeTruthy();
  });

  it("reports collapsed state when closed", () => {
    renderTimeField();

    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().getAttribute("aria-activedescendant")).toBeNull();
  });

  it("closes on outside pointer-down", async () => {
    renderTimeField();

    const user = userEvent.setup();
    await user.click(input());
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("TimeField selection", () => {
  it("commits the clicked row", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    await user.click(input());
    fireEvent.pointerDown(screen.getByRole("option", { name: "14:30" }));

    expect(onValueChange).toHaveBeenCalledWith("14:30");
  });

  it("commits the active row on Enter", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    input().focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledOnce();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens at the committed row so Home and End still reach the ends", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    input().focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{End}");
    await user.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("23:30");
  });
});

describe("TimeField typing", () => {
  it("commits typed shorthand on Enter", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "930");
    await user.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("09:30");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("commits a typed value that is not on the increment grid", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "9:37");
    await user.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("09:37");
  });

  it("commits typed text on blur", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "11:15");
    await user.tab();

    expect(onValueChange).toHaveBeenCalledWith("11:15");
  });

  it("shows the typed text while editing rather than the formatted value", async () => {
    renderTimeField();

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "9");

    expect(input().value).toBe("9");
  });

  it("re-formats from the committed value once editing ends", async () => {
    render(<StatefulTimeField />);

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "930");
    await user.keyboard("{Enter}");

    expect(input().value).toBe("09:30");
  });

  it("keeps invalid text visible, flags it, and does not emit", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "9:99");
    await user.keyboard("{Enter}");

    expect(onValueChange).not.toHaveBeenCalled();
    expect(input().value).toBe("9:99");
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });

  it("keeps invalid text after blur so the user can repair it", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "nonsense");
    await user.tab();

    expect(onValueChange).not.toHaveBeenCalled();
    expect(input().value).toBe("nonsense");
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });

  it("clears the invalid flag once the text becomes valid", async () => {
    render(<StatefulTimeField />);

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "9:99");
    await user.keyboard("{Enter}");

    expect(input().getAttribute("aria-invalid")).toBe("true");

    await user.clear(input());
    await user.type(input(), "9:30");
    await user.keyboard("{Enter}");

    expect(input().getAttribute("aria-invalid")).not.toBe("true");
  });

  it("reverts the draft on Escape without emitting", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "9:37");
    await user.keyboard("{Escape}");

    expect(onValueChange).not.toHaveBeenCalled();
    expect(input().value).toBe("10:00");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("inherits the afternoon from the current value in a 12-hour locale", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({
      locale: "en-US",
      onValueChange,
      value: parseLocalTime("13:00"),
    });

    const user = userEvent.setup();
    await user.clear(input());
    await user.type(input(), "2");
    await user.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("14:00");
  });

  it("accepts an empty field without emitting", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange });

    const user = userEvent.setup();
    await user.clear(input());
    await user.tab();

    expect(onValueChange).not.toHaveBeenCalled();
    expect(input().getAttribute("aria-invalid")).not.toBe("true");
  });
});

describe("TimeField disabled and read-only", () => {
  it("does not open when disabled", async () => {
    renderTimeField({ disabled: true });

    const user = userEvent.setup();
    await user.click(input());
    fireEvent.keyDown(input(), { key: "ArrowDown" });

    expect(input().hasAttribute("disabled")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open when read-only but stays focusable", async () => {
    renderTimeField({ readOnly: true });

    const user = userEvent.setup();
    await user.click(input());
    await user.keyboard("{ArrowDown}");

    expect(input().getAttribute("readonly")).toBe("");
    expect(input().hasAttribute("disabled")).toBeFalsy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not commit typing when read-only", async () => {
    const onValueChange = vi.fn<() => void>();
    renderTimeField({ onValueChange, readOnly: true });

    fireEvent.change(input(), { target: { value: "930" } });
    const user = userEvent.setup();
    input().focus();
    await user.keyboard("{Enter}");

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("TimeField accessibility passthrough", () => {
  it("honours an external invalid flag and description", () => {
    renderTimeField({ "aria-describedby": "dates-error", invalid: true });

    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(input().getAttribute("aria-describedby")).toContain("dates-error");
  });
});
