import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Toggle } from "../toggle";

import styles from "../toggle.module.css";

describe(Toggle, () => {
  it("renders the checked Root as a span with the track state classes", () => {
    render(<Toggle checked label="All day" onCheckedChange={() => {}} />);

    const sw = screen.getByRole("switch", { name: "All day" });

    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw).toHaveAttribute("data-checked");
    expect(sw).not.toHaveAttribute("data-unchecked");
  });

  it("marks both the Root and the Thumb with the checked data attribute", () => {
    render(<Toggle checked label="All day" onCheckedChange={() => {}} />);

    const sw = screen.getByRole("switch", { name: "All day" });
    const thumb = sw.firstElementChild;

    expect(sw).toHaveAttribute("data-checked");
    expect(sw).not.toHaveAttribute("data-unchecked");
    expect(thumb).toHaveAttribute("data-checked");
    expect(thumb).not.toHaveAttribute("data-unchecked");
  });

  it("hides the native checkbox input inside the checked Root", () => {
    render(<Toggle checked label="All day" onCheckedChange={() => {}} />);

    const sw = screen.getByRole("switch", { name: "All day" });
    const thumb = sw.firstElementChild;
    const input = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    );

    expect(thumb?.tagName).toBe("SPAN");
    expect(input).toHaveAttribute("aria-hidden", "true");
    expect(sw).not.toContainElement(input);
  });

  it("renders the unchecked Base UI state on the Root and Thumb", () => {
    render(
      <Toggle checked={false} label="All day" onCheckedChange={() => {}} />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    const thumb = sw.firstElementChild;

    expect(sw).toHaveAttribute("data-unchecked");
    expect(sw).not.toHaveAttribute("data-checked");
    expect(thumb).toHaveAttribute("data-unchecked");
    expect(thumb).not.toHaveAttribute("data-checked");
  });

  it("toggles with Space but not Enter", () => {
    const calls: boolean[] = [];

    render(
      <Toggle
        checked={false}
        label="All day"
        onCheckedChange={(value) => {
          calls.push(value);
        }}
      />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    fireEvent.keyDown(sw, { key: " " });
    expect(calls).toStrictEqual([true]);

    fireEvent.keyDown(sw, { key: "Enter" });
    expect(calls).toStrictEqual([true]);
  });

  it("toggles on click", async () => {
    const calls: boolean[] = [];

    render(
      <Toggle
        checked
        label="All day"
        onCheckedChange={(value) => {
          calls.push(value);
        }}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: "All day" }));
    expect(calls).toStrictEqual([false]);
  });

  it("pins the ui-kit disabled attributes and the wrapper disabled classes", () => {
    render(
      <Toggle checked disabled label="All day" onCheckedChange={() => {}} />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    const thumb = sw.firstElementChild;

    expect(sw.getAttribute("aria-disabled")).toBe("true");
    expect(sw.tabIndex).toBe(-1);
    expect(sw).toHaveAttribute("data-disabled");
    expect(sw.className).toContain(styles.trackDisabled);
    expect(thumb).toHaveAttribute("data-disabled");
  });

  it("disables the native input, marks its label, and blocks interaction", async () => {
    const calls: boolean[] = [];

    render(
      <Toggle
        checked
        disabled
        label="All day"
        onCheckedChange={(value) => {
          calls.push(value);
        }}
      />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    const input = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    expect(input).toBeDisabled();
    expect(screen.getByText("All day")).toHaveClass(styles.labelDisabled);

    const user = userEvent.setup();
    await user.click(sw);
    fireEvent.keyDown(sw, { key: " " });
    expect(calls).toStrictEqual([]);
  });

  it("sets aria-invalid and the wrapper danger-ring class", () => {
    render(
      <Toggle
        checked={false}
        invalid
        label="All day"
        onCheckedChange={() => {}}
      />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    expect(sw.getAttribute("aria-invalid")).toBe("true");
    expect(sw.className).toContain(styles.trackInvalid);
  });

  it("keeps hover and focus as CSS pseudo-states rather than invented Base UI attributes", async () => {
    render(
      <Toggle checked={false} label="All day" onCheckedChange={() => {}} />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    const user = userEvent.setup();
    await user.hover(sw);
    sw.focus();

    expect(sw).toHaveFocus();
    expect(sw).not.toHaveAttribute("data-hover");
    expect(sw).not.toHaveAttribute("data-focus");
  });

  it("sets aria-required and appends the required star after the text", () => {
    render(
      <Toggle
        checked={false}
        label="All day"
        onCheckedChange={() => {}}
        required
      />
    );

    const sw = screen.getByRole("switch", { name: /All day/u });
    const labelText = screen.getByText("All day");
    const label = labelText.closest("label");
    const asterisk = screen.getByText("*", { exact: true });

    expect(sw.getAttribute("aria-required")).toBe("true");
    expect(label).toHaveClass(styles.labelControl);
    expect(labelText?.textContent).toBe("All day*");
    expect(asterisk).toHaveAttribute("aria-hidden", "true");
  });

  it("renders toggle-first as track then label", () => {
    render(
      <Toggle
        checked
        label="All day"
        onCheckedChange={() => {}}
        type="toggle-first"
      />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    const label = screen.getByText("All day");

    expect(sw).toBeVisible();
    expect(label).toBeVisible();
    expect(sw.compareDocumentPosition(label)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("renders text-first as label then track", () => {
    render(
      <Toggle
        checked
        label="All day"
        onCheckedChange={() => {}}
        type="text-first"
      />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    const label = screen.getByText("All day");

    expect(label).toBeVisible();
    expect(sw).toBeVisible();
    expect(label.compareDocumentPosition(sw)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("renders toggle-only as the 32px track without a visible label element", () => {
    render(
      <Toggle
        checked
        label="All day"
        onCheckedChange={() => {}}
        type="toggle-only"
      />
    );

    const sw = screen.getByRole("switch", { name: "All day" });
    expect(screen.queryByText("All day")).toBeNull();
    expect(sw).toBeVisible();
    expect(sw).toHaveAttribute("aria-label", "All day");
  });
});
