import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../dialog";

import styles from "../dialog.module.css";

interface MutableElementRef {
  current: HTMLDivElement | null;
}

const renderDialog = (
  content: ReactElement = <DialogTitle>Preferences</DialogTitle>
) => {
  const onOpenChange = vi.fn<() => void>();

  render(
    <>
      <button type="button">Outside</button>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>{content}</DialogHeader>
          <DialogDescription>Choose how the calendar opens.</DialogDescription>
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { dialog: screen.getByRole("dialog"), onOpenChange };
};

const ControlledDialog = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Focus test</DialogTitle>
          <button type="button">First</button>
          <button type="button">Last</button>
        </DialogContent>
      </Dialog>
    </>
  );
};

describe(Dialog, () => {
  it("renders a labelled modal surface with linked title and description", () => {
    const { dialog } = renderDialog();

    expect(dialog).toHaveClass(styles.surface);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("dialog", { name: "Preferences" })).toBe(dialog);
  });

  it("links the visible title and description elements to the surface", () => {
    const { dialog } = renderDialog();

    expect(dialog).toHaveAccessibleDescription(
      "Choose how the calendar opens."
    );
    expect(screen.getByText("Preferences")).toHaveClass(styles.title);
    expect(screen.getByText("Choose how the calendar opens.")).toHaveClass(
      styles.description
    );
  });

  it("supports explicit accessible ids and content attributes", () => {
    render(
      <Dialog open onOpenChange={vi.fn<() => void>()}>
        <DialogContent
          aria-label="Calendar preferences"
          aria-labelledby="dialog-title"
          labelledBy="dialog-title"
          describedBy="dialog-description"
          id="preferences-dialog"
          className="consumer-surface"
          showCloseButton={false}
        >
          <DialogTitle id="dialog-title">Explicit title</DialogTitle>
          <DialogDescription id="dialog-description">
            Explicit description
          </DialogDescription>
          <p>Body</p>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog", { name: "Explicit title" });
    expect(dialog).toHaveAttribute("id", "preferences-dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "dialog-title");
    expect(dialog).toHaveAttribute("aria-describedby", "dialog-description");
    expect(dialog).toHaveClass("consumer-surface");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("portals the surface into an element container and forwards refs", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectRef: MutableElementRef = { current: null };

    const callbackRef = vi.fn<() => void>();

    const { rerender } = render(
      <Dialog open onOpenChange={vi.fn<() => void>()}>
        <DialogContent
          ref={objectRef}
          container={container}
          showCloseButton={false}
        >
          <DialogTitle>Portaled</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = within(container).getByRole("dialog");
    expect(objectRef.current).toBe(dialog);

    rerender(
      <Dialog open onOpenChange={vi.fn<() => void>()}>
        <DialogContent
          ref={callbackRef}
          container={container}
          showCloseButton={false}
        >
          <DialogTitle>Portaled</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(callbackRef).toHaveBeenCalledWith(dialog);
    container.remove();
  });

  it("focuses the panel, wraps both Tab edges, and restores the origin", async () => {
    render(<ControlledDialog />);
    const origin = screen.getByRole("button", { name: "Open" });
    origin.focus();
    const user = userEvent.setup();
    await user.click(origin);

    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(first);
    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(origin);
  });

  it("keeps focus on an empty surface and closes from its close control", async () => {
    const { dialog, onOpenChange } = renderDialog(
      <DialogTitle>Empty surface</DialogTitle>
    );
    const closeButton = screen.getByRole("button", { name: "Close" });

    dialog.focus();
    const user = userEvent.setup();
    fireEvent.keyDown(dialog, { cancelable: true, key: "Tab" });
    expect(document.activeElement).toBe(dialog);
    await user.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not close for inside pointer presses, but closes outside and prevents the press", () => {
    const { onOpenChange } = renderDialog();
    const inside = screen.getByRole("button", { name: "Cancel" });
    const outside = screen.getByRole("button", { name: "Outside" });

    fireEvent.pointerDown(inside);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(fireEvent.pointerDown(outside, { cancelable: true })).toBeFalsy();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("consumes the click that ends an outside press", () => {
    const onOutsideClick = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();

    render(
      <>
        <button type="button" onClick={onOutsideClick}>
          Outside target
        </button>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Preferences</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );

    const outside = screen.getByRole("button", { name: "Outside target" });

    fireEvent.pointerDown(outside, { cancelable: true });
    fireEvent.pointerUp(outside);
    fireEvent.click(outside);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("keeps Escape for a nested listbox and traps focus that leaves the modal", async () => {
    const { dialog, onOpenChange } = renderDialog(
      <>
        <DialogTitle>Listbox dialog</DialogTitle>
        <div role="listbox">Options</div>
        <button type="button">Focusable</button>
      </>
    );

    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();

    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    expect(document.activeElement).toBe(dialog);
  });

  it("renders nothing while closed and uses the default close label", () => {
    render(
      <Dialog open={false} onOpenChange={vi.fn<() => void>()}>
        <DialogContent>
          <DialogTitle>Closed</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
