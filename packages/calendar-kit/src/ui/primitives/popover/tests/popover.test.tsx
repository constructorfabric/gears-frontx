import { fireEvent, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler, useState } from "react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createShadowHost } from "../../../../__test-utils__/setup";
import { Dialog, DialogContent } from "../../dialog/dialog";
import { Popover } from "../popover";
import {
  computeInlinePopoverPosition,
  computePopoverPosition,
} from "../popover-position";
import type { InlinePopoverPosition } from "../popover-position";

interface MutableElementRef {
  current: HTMLElement | null;
}

const testHosts = new Set<HTMLElement>();

const renderInShadowRoot = (ui: ReactElement, hostDir?: string) => {
  const { host, root: shadowRoot } = createShadowHost();
  host.className = "popover-test-host";

  if (hostDir !== undefined && hostDir !== "") {
    host.setAttribute("dir", hostDir);
  }

  const mountNode = document.createElement("div");
  shadowRoot.append(mountNode);
  testHosts.add(host);
  const utils = render(ui, { container: mountNode });

  return { ...utils, host, mountNode, queries: within(mountNode), shadowRoot };
};

const activeIn = (shadowRoot: ShadowRoot): HTMLElement | null => {
  const active = shadowRoot.activeElement;

  return active instanceof HTMLElement ? active : null;
};

const rect = (
  top: number,
  left: number,
  width: number,
  height: number
): DOMRect => new DOMRect(left, top, width, height);

const removeTestHosts = (): void => {
  for (const node of testHosts) {
    node.remove();
  }

  testHosts.clear();
};

describe(computePopoverPosition, () => {
  afterEach(removeTestHosts);

  const viewport = { height: 768, width: 1024 };

  const size = { height: 100, width: 200 };

  it("places below when it fits and flips above when it does not", () => {
    expect(
      computePopoverPosition(rect(100, 100, 80, 40), size, viewport).side
    ).toBe("bottom");
    const result = computePopoverPosition(
      rect(700, 100, 80, 40),
      size,
      viewport
    );
    expect(result.side).toBe("top");
    expect(result.top).toBe(596);
  });

  it("aligns in both directions and clamps both axes", () => {
    const anchor = rect(100, 400, 80, 40);
    expect(
      computePopoverPosition(anchor, size, viewport, { dir: "ltr" }).left
    ).toBe(400);
    expect(
      computePopoverPosition(anchor, size, viewport, { dir: "rtl" }).left
    ).toBe(280);
    expect(
      computePopoverPosition(rect(100, 900, 80, 40), size, viewport).left
    ).toBe(816);

    const tall = computePopoverPosition(
      rect(100, 100, 80, 40),
      { height: 1200, width: 200 },
      { height: 800, width: 1024 }
    );
    const wide = computePopoverPosition(
      rect(100, 100, 80, 40),
      { height: 100, width: 2000 },
      { height: 800, width: 1024 }
    );
    expect(tall.top).toBeGreaterThanOrEqual(0);
    expect(wide.left).toBeGreaterThanOrEqual(0);
  });
});

describe(Popover, () => {
  afterEach(removeTestHosts);

  it("renders shadow-root-local dialog semantics and focuses the panel", () => {
    const objectRef: MutableElementRef = { current: null };

    const { mountNode, shadowRoot, queries } = renderInShadowRoot(
      <Popover
        ref={objectRef}
        open
        onOpenChange={() => {}}
        anchorRect={rect(100, 100, 80, 40)}
        label="Event details"
      >
        <button type="button">Inner action</button>
      </Popover>
    );

    const dialog = queries.getByRole("dialog");
    expect(mountNode.contains(dialog)).toBeTruthy();
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(dialog).toHaveAttribute("aria-label", "Event details");
    expect(objectRef.current).toBe(dialog);
    expect(activeIn(shadowRoot)).toBe(dialog);
  });

  it("forwards a callback ref to the rendered panel", () => {
    const callbackRef = vi.fn<(node: HTMLElement | null) => void>();

    renderInShadowRoot(
      <Popover
        ref={callbackRef}
        open
        onOpenChange={() => {}}
        anchorRect={rect(100, 100, 80, 40)}
        label="Callback"
      >
        <span>Body</span>
      </Popover>
    );

    expect(callbackRef).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it("moves focus into the panel, wraps Tab, and restores the origin", async () => {
    const { shadowRoot, rerender, queries } = renderInShadowRoot(
      <button type="button">Origin</button>
    );

    const origin = queries.getByRole("button", { name: "Origin" });
    origin.focus();

    rerender(
      <>
        <button type="button">Origin</button>
        <Popover
          open
          onOpenChange={() => {}}
          anchorRect={rect(100, 100, 80, 40)}
          label="Trap"
        >
          <button type="button">First</button>
          <button type="button">Second</button>
        </Popover>
      </>
    );

    const dialog = queries.getByRole("dialog");
    const [first, second] = queries.getAllByRole("button", {
      name: /First|Second/u,
    });
    expect(activeIn(shadowRoot)).toBe(dialog);
    second.focus();
    const user = userEvent.setup();
    await user.keyboard("{Tab}");
    expect(activeIn(shadowRoot)).toBe(first);
    await user.tab({ shift: true });
    expect(activeIn(shadowRoot)).toBe(second);

    rerender(<button type="button">Origin</button>);
    expect(activeIn(shadowRoot)).toBe(origin);
    expect(queries.queryByRole("dialog")).toBeNull();
  });

  it("keeps text fields in the focus-trap order with trailing actions", () => {
    const { shadowRoot, queries } = renderInShadowRoot(
      <Popover
        open
        onOpenChange={() => {}}
        anchorRect={rect(10, 10, 20, 20)}
        label="Trap"
      >
        <input aria-label="Title" />
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Popover>
    );

    const input = queries.getByRole("textbox", { name: "Title" });
    const firstAction = queries.getByRole("button", { name: "First action" });
    const lastAction = queries.getByRole("button", { name: "Last action" });

    input.focus();
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBeTruthy();
    firstAction.focus();
    expect(activeIn(shadowRoot)).toBe(firstAction);

    input.focus();
    expect(
      fireEvent.keyDown(input, { key: "Tab", shiftKey: true })
    ).toBeFalsy();
    expect(activeIn(shadowRoot)).toBe(lastAction);
  });

  it("keeps an empty panel focused when Tab is pressed", () => {
    const { queries, shadowRoot } = renderInShadowRoot(
      <Popover
        open
        onOpenChange={() => {}}
        anchorRect={rect(10, 10, 20, 20)}
        label="Empty"
      >
        <p>Static content</p>
      </Popover>
    );

    const dialog = queries.getByRole("dialog");
    expect(
      fireEvent.keyDown(dialog, { cancelable: true, key: "Tab" })
    ).toBeFalsy();
    expect(activeIn(shadowRoot)).toBe(dialog);
  });

  it("keeps an explicitly owned portaled target inside the popover", () => {
    const onOpenChange = vi.fn<() => void>();
    const ownedTarget = document.createElement("button");
    document.body.append(ownedTarget);

    try {
      renderInShadowRoot(
        <Popover
          open
          onOpenChange={onOpenChange}
          anchorRect={rect(10, 10, 20, 20)}
          label="Owned target"
          belongsTo={(target) => target === ownedTarget}
        >
          <button type="button">Inside</button>
        </Popover>
      );

      fireEvent.pointerDown(ownedTarget);
      expect(onOpenChange).not.toHaveBeenCalled();
      fireEvent.pointerDown(document.body);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      ownedTarget.remove();
    }
  });

  it("keeps the dialog it is anchored in open while it holds a press", () => {
    const onDialogOpenChange = vi.fn<() => void>();
    const onOpenChange = vi.fn<() => void>();

    const AnchoredCalendar = () => {
      const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);

      return (
        <Dialog open onOpenChange={onDialogOpenChange}>
          <DialogContent label="Event">
            <div ref={setAnchor}>
              <button type="button">Open</button>
            </div>
            {anchor === null ? null : (
              <Popover
                open
                onOpenChange={onOpenChange}
                anchorRect={rect(10, 10, 20, 20)}
                anchorElement={anchor}
                container={document.body}
                label="Choose date"
              >
                <button type="button">Day</button>
              </Popover>
            )}
          </DialogContent>
        </Dialog>
      );
    };

    const { queries } = renderInShadowRoot(<AnchoredCalendar />);
    const owner = queries.getByRole("dialog", { name: "Event" });
    const panel = within(document.body).getByRole("dialog", {
      name: "Choose date",
    });

    // The panel escapes the dialog to keep its own clipping and position.
    expect(owner.contains(panel)).toBeFalsy();

    fireEvent.pointerDown(within(panel).getByRole("button", { name: "Day" }));
    expect(onDialogOpenChange).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and outside pointerdown, but not inside", async () => {
    const onOpenChange = vi.fn<() => void>();

    const { queries } = renderInShadowRoot(
      <>
        <button type="button">Outside</button>
        <Popover
          open
          onOpenChange={onOpenChange}
          anchorRect={rect(10, 10, 20, 20)}
          label="Dismiss"
        >
          <button type="button">Inside</button>
        </Popover>
      </>
    );

    fireEvent.pointerDown(queries.getByRole("button", { name: "Inside" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it("swallows the click ending an outside press once the panel has gone", () => {
    const onOutsidePress = vi.fn<() => void>();

    const DismissingPopover = (): ReactElement => {
      const [open, setOpen] = useState(true);

      return (
        <>
          <button type="button" onClick={onOutsidePress}>
            Outside
          </button>
          {open ? (
            <Popover
              open
              onOpenChange={() => {
                setOpen(false);
              }}
              anchorRect={rect(10, 10, 20, 20)}
              label="Dismiss"
            >
              <button type="button">Inside</button>
            </Popover>
          ) : null}
        </>
      );
    };

    const { queries } = renderInShadowRoot(<DismissingPopover />);
    const outside = queries.getByRole("button", { name: "Outside" });

    fireEvent.pointerDown(outside);
    expect(queries.queryByRole("dialog", { name: "Dismiss" })).toBeNull();

    fireEvent.pointerUp(outside);
    fireEvent.click(outside);
    expect(onOutsidePress).not.toHaveBeenCalled();
  });

  it("dismisses nested layers from the inside out and lets listboxes own Escape", async () => {
    const outerClose = vi.fn<() => void>();
    const innerClose = vi.fn<() => void>();

    const { rerender } = renderInShadowRoot(
      <Popover
        open
        onOpenChange={outerClose}
        anchorRect={rect(10, 10, 20, 20)}
        label="Outer"
      >
        <button type="button">Outer body</button>
        <Popover
          open
          onOpenChange={innerClose}
          anchorRect={rect(20, 20, 20, 20)}
          label="Inner"
        >
          <div role="listbox">Options</div>
        </Popover>
      </Popover>
    );

    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(innerClose).not.toHaveBeenCalled();
    expect(outerClose).not.toHaveBeenCalled();

    rerender(
      <Popover
        open
        onOpenChange={outerClose}
        anchorRect={rect(10, 10, 20, 20)}
        label="Outer"
      >
        <button type="button">Outer body</button>
        <Popover
          open
          onOpenChange={innerClose}
          anchorRect={rect(20, 20, 20, 20)}
          label="Inner"
        >
          <button type="button">Inner body</button>
        </Popover>
      </Popover>
    );

    await user.keyboard("{Escape}");
    expect(innerClose).toHaveBeenCalledWith(false);
    fireEvent.pointerDown(document.body);
    expect(innerClose).toHaveBeenCalledTimes(2);
  });

  it("renders optional regions and only the necessary dividers", () => {
    const { queries } = renderInShadowRoot(
      <Popover
        open
        onOpenChange={() => {}}
        anchorRect={rect(10, 10, 20, 20)}
        label="Slots"
        header={<span>Header slot</span>}
        search={<input aria-label="Search input" />}
        footer={<button type="button">Footer action</button>}
        overlay={<span>Busy</span>}
      >
        <button type="button">Body</button>
      </Popover>
    );

    const dialog = queries.getByRole("dialog");
    expect(within(dialog).getByText("Header slot")).toBeInTheDocument();
    expect(dialog).toContainElement(queries.getByRole("textbox"));
    expect(dialog).toContainElement(
      queries.getByRole("button", { name: "Footer action" })
    );
    expect(within(dialog).getByText("Busy")).toBeInTheDocument();
    expect(dialog.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it("omits dividers when no optional regions are supplied", () => {
    const { queries: bareQueries } = renderInShadowRoot(
      <Popover
        open
        onOpenChange={() => {}}
        anchorRect={rect(10, 10, 20, 20)}
        label="Bare"
      >
        <button type="button">Body</button>
      </Popover>
    );

    expect(
      bareQueries.getByRole("dialog").querySelectorAll('[aria-hidden="true"]')
    ).toHaveLength(0);
  });

  it("honours explicit labelled-by, direction, and a supplied container", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onOpenChange = vi.fn<() => void>();
    render(
      <Popover
        open
        onOpenChange={onOpenChange}
        anchorRect={rect(10, 10, 20, 20)}
        anchorRectProvider={() => rect(20, 20, 20, 20)}
        ariaLabelledBy="external-title"
        container={container}
        label="Explicit"
      >
        <span id="external-title">External title</span>
      </Popover>
    );

    const dialog = within(container).getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "external-title");
    await waitFor(() => {
      expect(dialog.style.top).toBe("44px");
    });
    container.remove();
  });

  it("repositions when the shadow root scrolls", async () => {
    let top = 100;
    const shadowAddEventListener = vi.spyOn(
      ShadowRoot.prototype,
      "addEventListener"
    );

    try {
      const { mountNode, queries } = renderInShadowRoot(
        <Popover
          open
          onOpenChange={() => {}}
          anchorRect={rect(top, 10, 20, 20)}
          anchorRectProvider={() => rect(top, 10, 20, 20)}
          label="Scroll"
        >
          <button type="button">Body</button>
        </Popover>
      );

      expect(shadowAddEventListener).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
        expect.objectContaining({ capture: true, passive: true })
      );
      const dialog = queries.getByRole("dialog");
      await waitFor(() => {
        expect(dialog.style.top).toBe("124px");
      });
      top = 200;
      mountNode.dispatchEvent(new Event("scroll", { bubbles: true }));
      await waitFor(() => {
        expect(dialog.style.top).toBe("224px");
      });
    } finally {
      shadowAddEventListener.mockRestore();
    }
  });

  it("positions the open panel from its measured size before paint", () => {
    const panelRef: MutableElementRef = { current: null };

    const width = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth"
    );
    const height = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    );

    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 240,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 180,
    });

    try {
      render(
        <Popover
          ref={panelRef}
          open
          onOpenChange={() => {}}
          anchorRect={rect(700, 10, 20, 20)}
          label="Measured"
        >
          <span>Measured content</span>
        </Popover>
      );

      // Unmeasured it would sit at 724px, below an anchor it no longer fits under.
      expect(panelRef.current?.style.top).toBe("516px");
    } finally {
      if (width) {
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
      }

      if (height) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
      }
    }
  });

  it("does not rerender when reopening with the same measured size", () => {
    const panelRef: MutableElementRef = { current: null };

    let commitCount = 0;

    const onRender = () => {
      commitCount += 1;
    };

    const renderMeasuredPopover = (open: boolean): ReactElement => (
      <Profiler id="measured-popover" onRender={onRender}>
        <Popover
          ref={panelRef}
          open={open}
          onOpenChange={() => {}}
          anchorRect={rect(10, 10, 20, 20)}
          label="Measured"
        >
          <span>Measured content</span>
        </Popover>
      </Profiler>
    );

    const { rerender } = render(renderMeasuredPopover(true));
    const panel = panelRef.current;

    if (!panel) {
      throw new Error("Expected the popover panel to exist");
    }

    Object.defineProperty(panel, "offsetWidth", {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(panel, "offsetHeight", {
      configurable: true,
      value: 180,
    });

    rerender(renderMeasuredPopover(false));
    rerender(renderMeasuredPopover(true));
    const commitsAfterMeasurement = commitCount;

    rerender(renderMeasuredPopover(true));

    expect(commitCount).toBe(commitsAfterMeasurement + 1);
  });
});

const inlineAt = (
  anchor: DOMRect,
  panel: { height: number; width: number },
  area: { height: number; width: number }
): InlinePopoverPosition => {
  const position = computeInlinePopoverPosition(anchor, panel, area);

  if (position === null) {
    throw new Error("Expected the panel to fit beside the anchor");
  }

  return position;
};

describe(computeInlinePopoverPosition, () => {
  const viewport = { height: 800, width: 1200 };

  const size = { height: 300, width: 360 };

  it("opens after the anchor when there is room and points the arrow at its middle", () => {
    const position = inlineAt(rect(200, 100, 200, 40), size, viewport);

    expect(position.side).toBe("end");
    expect(position.left).toBe(312);
    expect(position.top + position.arrowTop).toBe(220);
  });

  it("flips before the anchor near the trailing edge", () => {
    const position = inlineAt(rect(200, 900, 200, 40), size, viewport);

    expect(position.side).toBe("start");
    expect(position.left).toBe(528);
  });

  it("gives up when neither side has room, so the panel opens below", () => {
    expect(
      computeInlinePopoverPosition(rect(200, 20, 1160, 40), size, viewport)
    ).toBeNull();
  });

  it("keeps the panel inside the viewport for an anchor near the bottom", () => {
    const position = inlineAt(rect(760, 100, 200, 30), size, viewport);

    expect(position.top).toBe(492);
    expect(position.arrowTop).toBe(280);
  });
});
