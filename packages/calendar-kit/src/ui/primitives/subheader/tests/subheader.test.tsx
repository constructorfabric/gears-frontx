import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Subheader } from "../subheader";

describe(Subheader, () => {
  it("renders requested heading level with generated and supplied ids", () => {
    const { rerender } = render(<Subheader headingLevel={4} title="Heading" />);
    const heading = screen.getByRole("heading", { level: 4, name: "Heading" });

    expect(heading.tagName).toBe("H4");
    expect(heading).toHaveAttribute("id");

    rerender(
      <Subheader
        headingLevel={1}
        title="Custom heading"
        titleId="custom-heading"
      />
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Custom heading" })
    ).toHaveAttribute("id", "custom-heading");
  });

  it("renders named back and close buttons that fire", async () => {
    const onBack = vi.fn<() => void>();
    const onClose = vi.fn<() => void>();

    render(
      <Subheader
        backLabel="Go back"
        closeLabel="Dismiss"
        onBack={onBack}
        onClose={onClose}
        title="Title"
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Go back" }));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("omits optional controls and divider when disabled", () => {
    render(<Subheader divider={false} title="Title" />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("keeps composed slots in order", () => {
    const { container } = render(
      <Subheader
        actions={<span>Actions</span>}
        additionalAction={<span>Additional</span>}
        badge={<span>2</span>}
        icon={<span>Icon</span>}
        tag={<span>Tag</span>}
        title="Title"
      />
    );

    expect(container.textContent).toContain("IconTitle2TagActionsAdditional");
  });
});
