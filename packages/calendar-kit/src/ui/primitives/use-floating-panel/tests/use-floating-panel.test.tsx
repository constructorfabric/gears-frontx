import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFloatingPanel } from "../use-floating-panel";

describe(useFloatingPanel, () => {
  it("returns no position while closed and positions an open panel", () => {
    const anchor = document.createElement("button");
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
      bottom: 140,
      height: 40,
      left: 100,
      right: 180,
      toJSON: () => ({}),
      top: 100,
      width: 80,
      x: 100,
      y: 100,
    });
    const anchorRef = { current: anchor };

    const { result, rerender } = renderHook(
      ({ open }) => useFloatingPanel(open, anchorRef),
      { initialProps: { open: false } }
    );
    expect(result.current.position).toBeNull();
    rerender({ open: true });
    expect(result.current.position).toStrictEqual({
      left: 100,
      side: "bottom",
      top: 144,
    });
  });

  it("accounts for panel size, direction, scroll, resize, and a missing anchor", async () => {
    const anchor = document.createElement("button");
    anchor.setAttribute("dir", "rtl");
    document.body.append(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
      bottom: 140,
      height: 40,
      left: 400,
      right: 480,
      toJSON: () => ({}),
      top: 100,
      width: 80,
      x: 400,
      y: 100,
    });
    const anchorRef = { current: anchor };

    const { result } = renderHook(() => useFloatingPanel(true, anchorRef));
    const panel = document.createElement("div");
    panel.setAttribute("dir", "rtl");
    Object.defineProperty(panel, "offsetWidth", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(panel, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    result.current.panelRef.current = panel;
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    await waitFor(() => {
      expect(result.current.position?.left).toBe(280);
    });

    const missingRef = { current: null };

    const missing = renderHook(() => useFloatingPanel(true, missingRef));
    expect(missing.result.current.position).toBeNull();

    const parent = document.createElement("div");
    parent.setAttribute("dir", "rtl");
    const nestedAnchor = document.createElement("button");
    parent.append(nestedAnchor);
    document.body.append(parent);
    vi.spyOn(nestedAnchor, "getBoundingClientRect").mockReturnValue({
      bottom: 140,
      height: 40,
      left: 400,
      right: 480,
      toJSON: () => ({}),
      top: 100,
      width: 80,
      x: 400,
      y: 100,
    });
    const nestedRef = { current: nestedAnchor };

    const nested = renderHook(() => useFloatingPanel(true, nestedRef));
    expect(nested.result.current.position?.left).toBe(480);
  });
});
