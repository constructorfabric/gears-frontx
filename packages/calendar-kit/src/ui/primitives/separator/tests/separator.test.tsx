import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Separator } from "../separator";

import styles from "../separator.module.css";

describe(Separator, () => {
  it("renders a semantic horizontal hr by default", () => {
    render(<Separator id="horizontal-divider" />);
    const separator = screen.getByRole("separator");

    expect(separator).toHaveProperty("tagName", "HR");
    expect(separator).toHaveAttribute("id", "horizontal-divider");
    expect(separator).toHaveAttribute("role", "separator");
    expect(separator).toHaveAttribute("aria-orientation", "horizontal");
    expect(separator).toHaveClass(styles.separator, styles.horizontal);
  });

  it("renders a semantic vertical separator and merges a className", () => {
    render(<Separator orientation="vertical" className="consumer-divider" />);
    const separator = screen.getByRole("separator");

    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveClass(
      styles.separator,
      styles.vertical,
      "consumer-divider"
    );
  });

  it("removes a decorative divider from the accessibility tree", () => {
    const { container } = render(
      <Separator decorative aria-label="Visual divider" />
    );

    expect(screen.queryByRole("separator")).toBeNull();
    const divider = container.firstElementChild;
    expect(divider).toHaveAttribute("aria-hidden", "true");
    expect(divider).not.toHaveAttribute("role");
  });

  it("forwards native hr attributes", () => {
    render(<Separator title="Section boundary" />);

    expect(screen.getByRole("separator")).toHaveAttribute(
      "title",
      "Section boundary"
    );
  });
});
