import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "../checkbox";

import styles from "../checkbox.module.css";

describe(Checkbox, () => {
  it("delegates to the ui-kit checkbox root and forwards checked state", () => {
    const inputRef = createRef<HTMLInputElement>();
    render(
      <Checkbox aria-label="Show courses" defaultChecked ref={inputRef} />
    );
    const checkbox = screen.getByRole("checkbox", { name: "Show courses" });
    const input = inputRef.current;

    expect(checkbox.tagName).toBe("SPAN");
    expect(checkbox).toHaveAttribute("data-checked");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).toBeChecked();
    expect(checkbox).toHaveClass(styles.checkbox);
  });

  it("bridges the native onChange callback from the ui-kit checked callback", async () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLInputElement>) => void>();
    render(<Checkbox aria-label="Show exams" onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox", { name: "Show exams" });
    const user = userEvent.setup();
    await user.click(checkbox);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].target).toBeInstanceOf(HTMLInputElement);
    expect(onChange.mock.calls[0]?.[0].target).toBeChecked();
    expect(checkbox).toHaveAttribute("data-checked");
  });

  it("forwards the hidden-input ref, id, disabled state and consumer class", () => {
    const inputRef = createRef<HTMLInputElement>();
    const { rerender } = render(
      <Checkbox
        aria-label="Show exams"
        className="consumer-checkbox"
        id="show-exams"
        ref={inputRef}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Show exams" });
    expect(inputRef.current).toBeInstanceOf(HTMLInputElement);
    expect(inputRef.current).toHaveAttribute("id", "show-exams");
    expect(checkbox).toHaveClass(styles.checkbox, "consumer-checkbox");

    rerender(
      <Checkbox
        aria-label="Show exams"
        className="consumer-checkbox"
        disabled
        id="show-exams"
        ref={inputRef}
      />
    );

    expect(checkbox).toHaveAttribute("data-disabled");
    expect(inputRef.current).toBeDisabled();
  });

  it("keeps an explicit sibling label associated with the hidden input", async () => {
    render(
      <div>
        <Checkbox id="show-courses" />
        <label htmlFor="show-courses">Show courses</label>
      </div>
    );

    const checkbox = screen.getByRole("checkbox", { name: "Show courses" });
    const user = userEvent.setup();
    await user.click(screen.getByText("Show courses"));

    expect(checkbox).toHaveAttribute("data-checked");
  });
});
