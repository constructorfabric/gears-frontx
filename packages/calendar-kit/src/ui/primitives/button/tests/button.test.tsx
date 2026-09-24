import { buttonVariants } from "@gears-frontx/ui-kit";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../button";

import styles from "../button.module.css";

describe(Button, () => {
  it("uses button type by default while preserving an explicit type", () => {
    const { rerender } = render(<Button>Default type</Button>);
    expect(
      screen.getByRole("button", { name: "Default type" }).getAttribute("type")
    ).toBe("button");

    rerender(<Button type="submit">Submit type</Button>);
    expect(
      screen.getByRole("button", { name: "Submit type" }).getAttribute("type")
    ).toBe("submit");
  });

  it("delegates the native root and mapped kit variant/size while retaining slots", () => {
    render(
      <Button
        variant="tertiary"
        size="m"
        leftIcon={<span>Leading icon</span>}
        rightIcon={<span>Trailing icon</span>}
        data-event-id="event-1"
        data-selected="true"
        data-event-card-compact="true"
      >
        Continue
      </Button>
    );

    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toHaveProperty("tagName", "BUTTON");

    for (const className of buttonVariants({
      size: "sm",
      variant: "outline",
    }).split(" ")) {
      expect(button.className).toContain(className);
    }

    expect(button).toHaveAttribute("data-event-id", "event-1");
    expect(button).toHaveAttribute("data-selected", "true");
    expect(button).toHaveAttribute("data-event-card-compact", "true");
  });

  it("hides the leading icon from assistive tech and keeps the trailing icon in its slot", () => {
    render(
      <Button
        variant="tertiary"
        size="m"
        leftIcon={<span>Leading icon</span>}
        rightIcon={<span>Trailing icon</span>}
      >
        Continue
      </Button>
    );

    const button = screen.getByRole("button", { name: "Continue" });
    expect(button.querySelector('[aria-hidden="true"]')).toContainElement(
      screen.getByText("Leading icon")
    );
    expect(button.querySelector(`.${styles.rightIcon}`)).toContainElement(
      screen.getByText("Trailing icon")
    );
  });

  it("derives the kit icon-only root while preserving the calendar accessible name", () => {
    render(
      <Button onlyIcon aria-label="Close" leftIcon={<span>Icon only</span>} />
    );

    const button = screen.getByRole("button", { name: "Close" });
    expect(button).toHaveAttribute("data-icon-only", "true");
    expect(button).toHaveClass(styles.onlyIcon);
    expect(button.querySelector('[aria-hidden="true"]')).toContainElement(
      screen.getByText("Icon only")
    );
  });

  it("delegates an HTMLButtonElement ref to the kit root", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Save</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Save" }));
  });

  it("keeps the default control size separate from the content-sized mode", () => {
    render(
      <>
        <Button>Default size</Button>
        <Button size="content">Content size</Button>
      </>
    );

    expect(screen.getByRole("button", { name: "Default size" })).toHaveClass(
      styles.sizeM
    );
    expect(
      screen.getByRole("button", { name: "Default size" })
    ).not.toHaveClass(styles.sizeContent);
    expect(screen.getByRole("button", { name: "Content size" })).toHaveClass(
      styles.sizeContent
    );
  });

  it("keeps an aria-pressed the caller set directly", () => {
    render(
      <Button aria-pressed={true} variant="tertiary">
        More
      </Button>
    );

    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("maps selected to aria-pressed and selected styling", () => {
    render(<Button selected>Selected</Button>);

    const button = screen.getByRole("button", { name: "Selected" });

    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("blocks clicks when disabled", async () => {
    const onClick = vi.fn<() => void>();

    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>
    );

    const button = screen.getByRole("button", { name: "Disabled" });
    const user = userEvent.setup();
    await user.click(button);

    expect(button.hasAttribute("disabled")).toBeTruthy();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls an enabled button handler", async () => {
    const onClick = vi.fn<() => void>();
    render(<Button onClick={onClick}>Save</Button>);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps a disabled button focusable when requested", async () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button disabled focusableWhenDisabled onClick={onClick}>
        Save
      </Button>
    );

    const button = screen.getByRole("button", { name: "Save" });
    const user = userEvent.setup();
    await user.click(button);

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBeFalsy();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a loading spinner, keeps its accessible name, and blocks clicks", async () => {
    const onClick = vi.fn<() => void>();

    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );

    const button = screen.getByRole("button", { name: "Save" });
    const user = userEvent.setup();
    await user.click(button);

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBeTruthy();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders icons and badges without replacing button content", () => {
    render(
      <Button
        leftIcon={<span>Leading icon</span>}
        rightIcon={<span>Trailing icon</span>}
        badge={<span>3</span>}
      >
        Continue
      </Button>
    );

    const button = screen.getByRole("button", { name: "Continue 3" });
    expect(button).toContainElement(screen.getByText("Leading icon"));
    expect(button).toContainElement(screen.getByText("Trailing icon"));
    expect(button).toContainElement(screen.getByText("3"));
  });

  it("preserves native keyboard event handling", async () => {
    const onKeyDown = vi.fn<() => void>();

    render(<Button onKeyDown={onKeyDown}>Keyboard</Button>);

    const button = screen.getByRole("button", { name: "Keyboard" });
    const user = userEvent.setup();
    button.focus();
    await user.keyboard("{Enter}");

    expect(button.tagName).toBe("BUTTON");
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});
