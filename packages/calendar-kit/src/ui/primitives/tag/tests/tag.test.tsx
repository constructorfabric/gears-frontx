import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Tag } from "../tag";

import styles from "../tag.module.css";

describe(Tag, () => {
  it("renders decorative icons in a hidden icon slot", () => {
    render(<Tag icon={<span>Icon</span>}>Label</Tag>);

    expect(document.querySelector('[aria-hidden="true"]')).toContainElement(
      screen.getByText("Icon")
    );
  });

  it("fires dismissal without bubbling to its parent", async () => {
    const onDismiss = vi.fn<() => void>();
    const onParentClick = vi.fn<() => void>();

    render(
      <div
        role="button"
        tabIndex={0}
        onClick={onParentClick}
        onKeyDown={() => {}}
      >
        <Tag onDismiss={onDismiss}>Label</Tag>
      </div>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("forwards native attributes and composes semantic classes", () => {
    render(
      <Tag
        aria-label="Calendar tag"
        color="blue"
        size="s"
        title="Details"
        variant="stroke"
      >
        Label
      </Tag>
    );

    const tag = screen.getByLabelText("Calendar tag");
    expect(tag.tagName).toBe("SPAN");
    expect(tag).toHaveAttribute("title", "Details");
    expect(tag).toHaveClass(
      styles.colorBlue,
      styles.sizeS,
      styles.variantStroke
    );
  });
});
