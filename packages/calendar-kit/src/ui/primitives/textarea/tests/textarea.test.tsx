import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Textarea } from "../textarea";

const getTextarea = (name: string): HTMLTextAreaElement => {
  const textarea = screen.getByRole("textbox", { name });

  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("Expected a textarea element");
  }

  return textarea;
};

describe(Textarea, () => {
  it("renders a textarea honouring the requested row count", () => {
    render(<Textarea aria-label="Description" rows={5} />);

    const textarea = getTextarea("Description");

    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveProperty("rows", 5);
  });

  it("wires a visible label to the generated textarea id", () => {
    render(<Textarea label="Description" />);

    const textarea = getTextarea("Description");
    const visibleLabel = screen.getByText("Description").closest("label");

    expect(textarea.id).not.toBe("");
    expect(visibleLabel?.htmlFor).toBe(textarea.id);
  });

  it("forwards change events and native textarea props", async () => {
    const onChange = vi.fn<() => void>();

    render(
      <Textarea
        aria-label="Description"
        defaultValue=""
        maxLength={100}
        onChange={onChange}
        rows={4}
      />
    );

    const textarea = getTextarea("Description");

    const user = userEvent.setup();
    await user.click(textarea);
    await user.paste("notes");

    expect(textarea).toHaveProperty("maxLength", 100);
    expect(textarea).toHaveProperty("value", "notes");
    expect(onChange).toHaveBeenCalledOnce();
    expect(textarea.style.getPropertyValue("--rows")).toBe("4");
  });

  it("keeps the ui-kit rows floor/style merge and forwards the native ref", () => {
    const ref = createRef<HTMLTextAreaElement>();

    render(
      <Textarea
        aria-label="Description"
        ref={ref}
        rows={6}
        style={{ color: "rebeccapurple" }}
      />
    );

    const textarea = getTextarea("Description");
    expect(ref.current).toBe(textarea);
    expect(textarea.style.getPropertyValue("--rows")).toBe("6");
    expect(textarea.style.color).toBe("rebeccapurple");
  });

  it("exposes invalid state and links its bottom message", () => {
    render(
      <Textarea label="Description" invalid message="Description is required" />
    );

    const textarea = getTextarea("Description");
    const message = screen.getByText("Description is required");

    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("keeps read-only textareas focusable and selectable without allowing edits", async () => {
    const onChange = vi.fn<() => void>();
    render(
      <Textarea
        aria-label="Description"
        defaultValue="copy me"
        onChange={onChange}
        readOnly
      />
    );

    const textarea = getTextarea("Description");

    const user = userEvent.setup();
    await user.keyboard("x");
    textarea.focus();
    textarea.setSelectionRange(0, 4);

    expect(textarea).toHaveProperty("readOnly", true);
    expect(textarea).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(4);
  });

  it("keeps the read-only value intact and reports no change", async () => {
    const onChange = vi.fn<() => void>();
    render(
      <Textarea
        aria-label="Description"
        defaultValue="copy me"
        onChange={onChange}
        readOnly
      />
    );

    const textarea = getTextarea("Description");

    const user = userEvent.setup();
    await user.keyboard("x");

    expect(textarea).toHaveProperty("value", "copy me");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blocks user typing when disabled", () => {
    const onChange = vi.fn<() => void>();
    render(
      <Textarea
        aria-label="Description"
        defaultValue="before"
        disabled
        onChange={onChange}
      />
    );

    const textarea = getTextarea("Description");

    fireEvent.keyDown(textarea, { key: "x" });

    expect(textarea).toHaveProperty("value", "before");
    expect(onChange).not.toHaveBeenCalled();
    expect(textarea).toHaveProperty("disabled", true);
  });
});
