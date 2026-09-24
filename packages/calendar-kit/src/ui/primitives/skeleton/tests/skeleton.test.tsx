import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "../skeleton";

import styles from "../skeleton.module.css";

describe(Skeleton, () => {
  it("is hidden from screen readers by default", () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).toHaveClass(styles.skeleton);
  });

  it("lets callers override aria-hidden and compose a class name", () => {
    const { container } = render(
      <Skeleton aria-hidden={false} className="custom" />
    );

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "false");
    expect(container.firstElementChild).toHaveClass(styles.skeleton, "custom");
  });
});
