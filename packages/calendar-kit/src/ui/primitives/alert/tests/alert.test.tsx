import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert } from "../alert";

import styles from "../alert.module.css";

describe(Alert, () => {
  it("renders a named alert region with the default variant", () => {
    render(<Alert aria-label="Calendar error">Could not load events</Alert>);

    const alert = screen.getByRole("alert", { name: "Calendar error" });
    expect(alert).toHaveTextContent("Could not load events");
    expect(alert).toHaveClass(styles.alert, styles.default);
  });

  it("supports the destructive variant and consumer classes", () => {
    render(
      <Alert className="consumer-alert" variant="destructive">
        Something went wrong
      </Alert>
    );

    expect(screen.getByRole("alert")).toHaveClass(
      styles.alert,
      styles.destructive,
      "consumer-alert"
    );
  });
});
