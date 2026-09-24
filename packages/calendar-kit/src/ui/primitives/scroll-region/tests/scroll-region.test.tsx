import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScrollRegion } from "../scroll-region";

import styles from "../scroll-region.module.css";

describe(ScrollRegion, () => {
  it("renders a native labelled region with its content", () => {
    render(
      <ScrollRegion aria-label="Calendar events">
        <p>Events</p>
      </ScrollRegion>
    );

    const region = screen.getByLabelText("Calendar events");
    expect(region).toHaveClass(styles.scrollRegion);
    expect(screen.getByText("Events")).toBeVisible();
  });

  it("forwards a ref and consumer class", () => {
    const ref = { current: null as HTMLDivElement | null };

    render(<ScrollRegion ref={ref} className="consumer-region" />);

    expect(ref.current).toHaveClass(styles.scrollRegion, "consumer-region");
  });
});
