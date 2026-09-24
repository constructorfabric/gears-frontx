import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../alert-dialog";

import styles from "../alert-dialog.module.css";

const renderAlert = () => {
  const onOpenChange = vi.fn<() => void>();
  const onCancel = vi.fn<() => void>();
  const onConfirm = vi.fn<() => void>();

  render(
    <>
      <button type="button">Outside</button>
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return {
    alertDialog: screen.getByRole("alertdialog"),
    onCancel,
    onConfirm,
    onOpenChange,
  };
};

describe(AlertDialog, () => {
  it("renders an alertdialog with a labelled description and modal backdrop", () => {
    const { alertDialog } = renderAlert();

    expect(alertDialog).toHaveAttribute("role", "alertdialog");
    expect(alertDialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("alertdialog", { name: "Discard changes?" })).toBe(
      alertDialog
    );
    expect(alertDialog).toHaveAccessibleDescription("Your edits will be lost.");
  });

  it("renders the modal backdrop behind the alert dialog", () => {
    renderAlert();

    expect(document.querySelector(`.${styles.backdrop}`)).not.toBeNull();
  });

  it("focuses the safe cancel action first and reports cancel", async () => {
    const { onCancel, onOpenChange } = renderAlert();
    const cancel = screen.getByRole("button", { name: "Keep editing" });

    expect(document.activeElement).toBe(cancel);
    const user = userEvent.setup();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports confirm and Escape through the controlled callback", async () => {
    const { alertDialog, onOpenChange, onConfirm } = renderAlert();
    const action = screen.getByRole("button", { name: "Discard" });

    action.focus();
    const user = userEvent.setup();
    await user.click(action);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBe(alertDialog);
    });
  });

  it("wraps focus in both directions inside a supplied container", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onOpenChange = vi.fn<() => void>();

    render(
      <>
        <button type="button">Outside</button>
        <AlertDialog open onOpenChange={onOpenChange}>
          <AlertDialogContent container={container} showBackdrop={false}>
            <AlertDialogTitle>Contained confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm inside the host.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );

    const alertDialog = within(container).getByRole("alertdialog");
    expect(container).toContainElement(alertDialog);
    expect(document.querySelector(`.${styles.backdrop}`)).toBeNull();

    const cancel = within(alertDialog).getByRole("button", { name: "Cancel" });
    const confirm = within(alertDialog).getByRole("button", {
      name: "Confirm",
    });
    confirm.focus();
    const user = userEvent.setup();
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(cancel);
    cancel.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);

    container.remove();
  });

  it("closes the portalled alert dialog on an outside pointer down", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onOpenChange = vi.fn<() => void>();

    render(
      <>
        <button type="button">Outside</button>
        <AlertDialog open onOpenChange={onOpenChange}>
          <AlertDialogContent container={container} showBackdrop={false}>
            <AlertDialogTitle>Contained confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm inside the host.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );

    const outside = screen.getByRole("button", { name: "Outside" });

    expect(fireEvent.pointerDown(outside, { cancelable: true })).toBeFalsy();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    container.remove();
  });

  it("keeps the alert open when an action prevents its default close", async () => {
    const onOpenChange = vi.fn<() => void>();
    const preventClose = vi.fn<(event: MouseEvent<HTMLButtonElement>) => void>(
      (event) => {
        event.preventDefault();
      }
    );

    render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogTitle>Prevented</AlertDialogTitle>
          <AlertDialogAction onClick={preventClose}>
            Stay open
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Stay open" }));
    expect(preventClose).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("supports explicit ids, native attributes, and a closed state", () => {
    render(
      <AlertDialog open={false} onOpenChange={vi.fn<() => void>()}>
        <AlertDialogContent
          aria-label="Danger confirmation"
          labelledBy="alert-title"
          describedBy="alert-description"
          id="alert-surface"
        >
          <AlertDialogTitle id="alert-title">Danger</AlertDialogTitle>
          <AlertDialogDescription id="alert-description">
            Cannot be undone.
          </AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
