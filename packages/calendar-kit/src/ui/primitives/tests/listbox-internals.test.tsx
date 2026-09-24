import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Listbox } from "../listbox-internals";
import type { ListboxOption } from "../listbox-internals";
import { useListboxController } from "../listbox-internals-controller";

const options: readonly ListboxOption[] = Array.from(
  { length: 24 },
  (_, index) => ({
    label: `Option ${index}`,
    value: `option-${index}`,
  })
);

const noopSelect = (): void => {
  // The harness only exercises the open/close lifecycle.
};

const ExternalAnchorHarness = () => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const controller = useListboxController({
    anchorRef,
    focusTrigger: () => anchorRef.current?.focus(),
    onSelect: noopSelect,
    options,
    panelRef,
  });

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => {
          controller.openListbox();
        }}
      >
        Open options
      </button>
      {controller.open ? (
        <Listbox
          ref={panelRef}
          anchorRef={anchorRef}
          options={options}
          activeIndex={controller.activeIndex}
          onActiveIndexChange={(index) => {
            controller.setActiveIndex(index);
          }}
          onOptionSelect={(option) => {
            controller.selectOption(option);
          }}
        />
      ) : null}
    </>
  );
};

describe("live listbox internals", () => {
  it("does not close when a long external-anchor panel is scrolled", async () => {
    render(<ExternalAnchorHarness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open options" }));
    const panel = screen.getByRole("listbox");

    expect(screen.getAllByRole("option")).toHaveLength(24);
    fireEvent.scroll(panel);

    expect(screen.getByRole("listbox")).toBe(panel);
  });

  it("coalesces repeated panel scrolls into one reposition", async () => {
    const frames: ((timestamp: number) => void)[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => {
      frames.push(frame);

      return frames.length;
    });

    render(<ExternalAnchorHarness />);
    const trigger = screen.getByRole("button", { name: "Open options" });
    const anchorRect = vi.spyOn(trigger, "getBoundingClientRect");
    const user = userEvent.setup();
    await user.click(trigger);
    const panel = screen.getByRole("listbox");
    const repositionCountAfterOpen = anchorRect.mock.calls.length;

    for (let index = 0; index < 5; index += 1) {
      fireEvent.scroll(panel);
    }

    expect(frames).toHaveLength(1);
    expect(anchorRect).toHaveBeenCalledTimes(repositionCountAfterOpen);
    act(() => {
      frames.shift()?.(0);
    });
    expect(anchorRect).toHaveBeenCalledTimes(repositionCountAfterOpen + 1);
  });
});
