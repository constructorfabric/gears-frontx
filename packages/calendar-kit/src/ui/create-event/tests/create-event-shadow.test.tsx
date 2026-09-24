import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { createShadowHost } from "../../../__test-utils__/setup";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type { TimedCreateEventDraft } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { CreateEventPopover } from "../create-event-popover";
import type { CreateEventPopoverProps } from "../create-event-popover";

const DATE = calendarDate("2026-08-24");

const DRAFT: TimedCreateEventDraft = {
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
};

const props = (
  overrides: Partial<CreateEventPopoverProps> = {}
): CreateEventPopoverProps => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [],
  defaultDraft: DRAFT,
  direction: "ltr",
  locale: "en-US",
  locations: [],
  onCancel: () => {},
  onSubmit: vi.fn<() => undefined>(),
  people: [],
  t,
  timeZone: UTC,
  ...overrides,
});

const ShadowPopoverHarness = (): ReactElement => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open create event
      </button>
      <CreateEventPopover
        {...props({
          defaultOpen: undefined,
          onCancel: () => {
            setOpen(false);
          },
          onOpenChange: setOpen,
          open,
        })}
      />
    </>
  );
};

const queryShadowDialog = (
  root: ShadowRoot,
  name: RegExp
): HTMLElement | null =>
  [...root.querySelectorAll<HTMLElement>('[role="dialog"]')].find((dialog) =>
    name.test(dialog.getAttribute("aria-label") ?? "")
  ) ?? null;

const getShadowDialog = (root: ShadowRoot, name: RegExp): HTMLElement => {
  const dialog = queryShadowDialog(root, name);

  if (dialog === null) {
    throw new Error(`Missing shadow-root dialog: ${name}`);
  }

  return dialog;
};

describe("CreateEventPopover attached shadow-root contract", () => {
  it("keeps the compact dialog in the attached shadow root and traps/restores focus there", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    root.append(container);

    render(<ShadowPopoverHarness />, { container });

    const trigger = within(container).getByRole("button", {
      name: "Open create event",
    });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = getShadowDialog(root, /create/iu);

    assert(dialog.getRootNode()).toBe(root);

    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((element) => element.tabIndex >= 0);

    const [firstFocusable] = focusable;
    const lastFocusable = focusable.at(-1);

    if (firstFocusable === undefined || lastFocusable === undefined) {
      throw new Error("Expected a focusable dialog control");
    }

    assert(root.activeElement).not.toBe(trigger);

    lastFocusable.focus();
    fireEvent.keyDown(lastFocusable, { key: "Tab" });

    assert(root.activeElement).toBe(firstFocusable);

    firstFocusable.focus();
    fireEvent.keyDown(firstFocusable, { key: "Tab", shiftKey: true });

    assert(root.activeElement).toBe(lastFocusable);

    fireEvent.keyDown(dialog, { key: "Escape" });

    assert(queryShadowDialog(root, /create/iu)).toBeNull();
    assert(root.activeElement).toBe(trigger);

    host.remove();
  });

  it("mounts the overlay at the shadow-root layer instead of inside a raised grid container", () => {
    const { host, root } = createShadowHost();
    const gridContainer = document.createElement("div");
    const container = document.createElement("div");
    gridContainer.style.position = "relative";
    gridContainer.style.zIndex = "3";
    gridContainer.append(container);
    root.append(gridContainer);

    render(
      <CreateEventPopover {...props({ defaultOpen: undefined, open: true })} />,
      { container }
    );

    const dialog = getShadowDialog(root, /create/iu);

    assert(gridContainer).not.toContainElement(dialog);
    assert(dialog.parentNode).toBe(root);

    host.remove();
  });

  it("keeps nested repeat Escape scoped to the child and keeps expansion in the same shadow root", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    root.append(container);

    render(<ShadowPopoverHarness />, { container });
    fireEvent.click(
      within(container).getByRole("button", { name: "Open create event" })
    );

    const compactDialog = getShadowDialog(root, /create/iu);
    fireEvent.change(within(compactDialog).getByLabelText(/repeat/iu), {
      target: { value: "custom" },
    });

    const repeatDialog = getShadowDialog(root, /custom|repeat/iu);

    assert(repeatDialog.getRootNode()).toBe(root);

    fireEvent.keyDown(repeatDialog, { key: "Escape" });

    assert(queryShadowDialog(root, /custom|repeat/iu)).toBeNull();
    assert(getShadowDialog(root, /create/iu)).toBeInTheDocument();

    fireEvent.click(
      within(compactDialog).getByRole("button", { name: /expand/iu })
    );

    const expandedDialog = getShadowDialog(root, /create/iu);

    assert(expandedDialog.getRootNode()).toBe(root);
    assert(expandedDialog).toHaveAttribute("aria-modal", "true");
    assert(within(expandedDialog).getByLabelText(/title/iu)).toHaveValue(
      "Planning session"
    );

    host.remove();
  });

  it("keeps Tab on the shadow dialog when focus starts outside its focusable controls", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    root.append(container);

    render(<ShadowPopoverHarness />, { container });
    fireEvent.click(
      within(container).getByRole("button", { name: "Open create event" })
    );

    const dialog = getShadowDialog(root, /create/iu);
    dialog.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });

    assert(root.activeElement).toBe(dialog);
    host.remove();
  });

  it("does not leak an overlay into document.body when the host is attached elsewhere", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    root.append(container);

    render(
      <CreateEventPopover {...props({ defaultOpen: undefined, open: true })} />,
      { container }
    );

    const dialog = getShadowDialog(root, /create/iu);

    assert(dialog.getRootNode()).toBe(root);
    assert(screen.queryByRole("dialog", { name: /create/iu })).toBeNull();

    host.remove();
  });
});
