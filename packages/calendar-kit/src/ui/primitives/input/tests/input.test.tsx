import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "../input";

import styles from "../input.module.css";

const getInput = (name: string): HTMLInputElement => {
  const input = screen.getByRole("textbox", { name });

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected an input element");
  }

  return input;
};

describe(Input, () => {
  it("wires a visible label to the generated input id", () => {
    render(<Input label="Event title" />);

    const input = screen.getByRole("textbox", { name: "Event title" });
    const visibleLabel = screen.getByText("Event title").closest("label");

    expect(input.id).not.toBe("");
    expect(visibleLabel?.htmlFor).toBe(input.id);
  });

  it("associates field chrome with the input for native focus behavior", () => {
    render(<Input label="Event title" />);

    const input = getInput("Event title");
    const chrome = input.closest("label");

    expect(chrome).not.toBeNull();
    expect(chrome?.htmlFor).toBe(input.id);
    expect([...(input.labels ?? [])]).toContain(chrome);
  });

  it("forwards change events and native input props", async () => {
    const onChange = vi.fn<() => void>();

    render(
      <Input
        aria-label="Title"
        defaultValue=""
        maxLength={20}
        onChange={onChange}
      />
    );

    const input = screen.getByRole("textbox", { name: "Title" });

    const user = userEvent.setup();
    await user.click(input);
    await user.paste("abc");

    expect(input).toHaveProperty("maxLength", 20);
    expect(input).toHaveProperty("value", "abc");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("bridges ui-kit value changes while preserving the native change event and ref target", async () => {
    const onChange = vi.fn<() => void>();
    const onValueChange = vi.fn<() => void>();
    const ref = createRef<HTMLInputElement>();

    render(
      <Input
        aria-label="Title"
        defaultValue=""
        onChange={onChange}
        onValueChange={onValueChange}
        ref={ref}
      />
    );

    const input = getInput("Title");
    const user = userEvent.setup();
    await user.click(input);
    await user.paste("abc");

    expect(ref.current).toBe(input);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("abc");
  });

  it("blocks user typing when disabled", () => {
    const onChange = vi.fn<() => void>();
    render(
      <Input
        aria-label="Title"
        disabled
        defaultValue="before"
        onChange={onChange}
      />
    );

    const input = getInput("Title");

    fireEvent.keyDown(input, { key: "x" });

    expect(input).toHaveProperty("value", "before");
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveProperty("disabled", true);
  });

  it("keeps read-only input focusable and selectable without allowing edits", async () => {
    const onChange = vi.fn<() => void>();
    render(
      <Input
        aria-label="Title"
        defaultValue="copy me"
        onChange={onChange}
        readOnly
      />
    );

    const input = getInput("Title");

    const user = userEvent.setup();
    await user.keyboard("x");
    input.focus();
    input.setSelectionRange(0, 4);

    expect(input).toHaveProperty("readOnly", true);
    expect(input).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);
  });

  it("keeps the read-only value intact and reports no change", async () => {
    const onChange = vi.fn<() => void>();
    render(
      <Input
        aria-label="Title"
        defaultValue="copy me"
        onChange={onChange}
        readOnly
      />
    );

    const input = getInput("Title");

    const user = userEvent.setup();
    await user.keyboard("x");

    expect(input).toHaveProperty("value", "copy me");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("links an invalid message through aria attributes", () => {
    render(<Input label="Event title" invalid message="Title is required" />);

    const input = screen.getByRole("textbox", { name: "Event title" });
    const message = screen.getByText("Title is required");

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("renders required marker and all optional slots", async () => {
    const action = vi.fn<() => void>();

    render(
      <Input
        label="Amount"
        required
        iconLeft={<span>Leading icon</span>}
        prefix={<span>$</span>}
        suffix={<span>USD</span>}
        action={
          <button type="button" aria-label="Clear amount" onClick={action}>
            Clear
          </button>
        }
      />
    );

    screen.getByText("Amount");
    screen.getByText("*");
    screen.getByText("$");
    screen.getByText("USD");
    const amountInput = screen.getByRole("textbox", { name: "Amount" });
    expect(amountInput.className).toContain(styles.controlWithIcon);
    expect(screen.getByText("Leading icon")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clear amount" }));

    expect(action).toHaveBeenCalledOnce();
  });

  it("keeps the control mounted while an action slot appears", () => {
    const { rerender } = render(<Input aria-label="Title" />);
    const input = getInput("Title");

    rerender(
      <Input
        aria-label="Title"
        action={
          <button type="button" aria-label="Clear">
            Clear
          </button>
        }
      />
    );

    expect(getInput("Title")).toBe(input);
  });

  it("keeps interactive action outside label activation", () => {
    render(
      <Input
        aria-label="Amount"
        action={
          <button type="button" aria-label="Clear amount">
            Clear
          </button>
        }
      />
    );

    expect(
      screen.getByRole("button", { name: "Clear amount" }).closest("label")
    ).toBeNull();
  });

  it("renders a leading action ahead of the control, opposite the trailing slot", () => {
    render(
      <Input
        aria-label="Start date"
        leadingAction={
          <button type="button" aria-label="Open calendar">
            Open
          </button>
        }
        action={
          <button type="button" aria-label="Clear date">
            Clear
          </button>
        }
      />
    );

    const control = getInput("Start date");
    const leading = screen.getByRole("button", { name: "Open calendar" });
    const trailing = screen.getByRole("button", { name: "Clear date" });
    const follows = Node.DOCUMENT_POSITION_FOLLOWING;

    expect(leading.compareDocumentPosition(control)).toBe(follows);
    expect(control.compareDocumentPosition(trailing)).toBe(follows);
  });

  it("reserves the leading icon lane instead of letting value text overlap it", () => {
    render(
      <Input
        aria-label="Date"
        iconLeft={<span>Leading icon</span>}
        value="Thu, Sep 17"
        onChange={() => {}}
      />
    );

    const input = getInput("Date");
    expect(screen.getByText("Leading icon")).toBeInTheDocument();
    expect(input).toHaveValue("Thu, Sep 17");
  });
});
