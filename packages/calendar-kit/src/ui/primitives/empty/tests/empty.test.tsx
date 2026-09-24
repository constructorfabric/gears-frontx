import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Empty } from "../empty";

import styles from "../empty.module.css";

describe(Empty, () => {
  it("renders its children in a status region", () => {
    render(<Empty aria-label="No events">No events scheduled</Empty>);

    const empty = screen.getByRole("status", { name: "No events" });
    expect(empty).toHaveTextContent("No events scheduled");
    expect(empty).toHaveClass(styles.empty);
  });

  it("composes consumer classes without adding data attributes", () => {
    const { container } = render(<Empty className="consumer-empty" />);
    const empty = container.firstElementChild;

    expect(empty).toHaveClass(styles.empty, "consumer-empty");
  });
});
