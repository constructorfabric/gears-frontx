import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Sheet, useSheetClose } from "../sheet";

import styles from "../sheet.module.css";

interface MutableElementRef {
  current: HTMLElement | null;
}

const CloseButton = () => {
  const requestClose = useSheetClose();

  return (
    <button onClick={requestClose} type="button">
      Close
    </button>
  );
};

const renderSheet = (onOpenChange = vi.fn<() => void>()) => {
  render(
    <>
      <button type="button">Elsewhere</button>
      <Sheet label="Details" onOpenChange={onOpenChange} open>
        <CloseButton />
        <button type="button">Middle</button>
        <button type="button">Last</button>
      </Sheet>
    </>
  );

  return { dialog: screen.getByRole("dialog"), onOpenChange };
};

const withinContainer = (container: HTMLElement): HTMLElement =>
  within(container).getByRole("dialog");

describe(Sheet, () => {
  it("is a named modal dialog over a scrim", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Details" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.querySelector(`.${styles.scrim}`)).not.toBeNull();
  });

  it("moves focus to the panel and back to the origin", () => {
    render(<button type="button">Open</button>);
    const origin = screen.getByRole("button", { name: "Open" });
    origin.focus();
    const { unmount } = render(
      <Sheet label="Details" onOpenChange={vi.fn<() => void>()} open>
        <button type="button">First</button>
      </Sheet>
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    unmount();
    expect(document.activeElement).toBe(origin);
  });

  it("updates focus when controlled open changes", () => {
    render(<button type="button">Open</button>);
    const origin = screen.getByRole("button", { name: "Open" });
    origin.focus();
    const { rerender } = render(
      <Sheet label="Details" onOpenChange={vi.fn<() => void>()} open>
        <button type="button">First</button>
      </Sheet>
    );
    rerender(
      <Sheet label="Details" onOpenChange={vi.fn<() => void>()} open={false}>
        <button type="button">First</button>
      </Sheet>
    );
    expect(document.activeElement).toBe(origin);
    rerender(
      <Sheet label="Details" onOpenChange={vi.fn<() => void>()} open>
        <button type="button">First</button>
      </Sheet>
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("reports close-hook and Escape close requests", async () => {
    const { onOpenChange } = renderSheet();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("closes outside but not inside, and wraps Tab in both directions", async () => {
    const { onOpenChange, dialog } = renderSheet();
    fireEvent.mouseDown(dialog);
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Elsewhere" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    const user = userEvent.setup();
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(first);
    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("renders the start-edge panel above the others", () => {
    const { rerender } = render(
      <Sheet
        label="Details"
        onOpenChange={vi.fn<() => void>()}
        open
        side="start"
      >
        <button type="button">First</button>
      </Sheet>
    );
    expect(rerender).toBeTypeOf("function");
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs.at(-1)).toHaveClass(styles.panelStart);
  });

  it("keeps Tab inside when there are no focusable descendants and portals to a container", () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(
      <Sheet
        container={container}
        label="Details"
        onOpenChange={vi.fn<() => void>()}
        open
      >
        <p>Static content</p>
      </Sheet>
    );
    const dialog = withinContainer(container);
    expect(
      fireEvent.keyDown(dialog, { cancelable: true, key: "Tab" })
    ).toBeFalsy();
    expect(document.activeElement).toBe(dialog);
    container.remove();
  });

  it("forwards object and callback refs", () => {
    const objectRef: MutableElementRef = { current: null };

    const callbackRef = vi.fn<() => void>();

    const { rerender } = render(
      <Sheet
        ref={objectRef}
        label="Details"
        onOpenChange={vi.fn<() => void>()}
        open
      >
        <button type="button">First</button>
      </Sheet>
    );

    expect(objectRef.current).toBe(screen.getByRole("dialog"));
    rerender(
      <Sheet
        ref={callbackRef}
        label="Details"
        onOpenChange={vi.fn<() => void>()}
        open
      >
        <button type="button">First</button>
      </Sheet>
    );

    expect(callbackRef).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it("renders nothing while closed", () => {
    render(
      <Sheet label="Details" onOpenChange={vi.fn<() => void>()} open={false}>
        <button type="button">Body</button>
      </Sheet>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(`.${styles.scrim}`)).toBeNull();
  });
});
