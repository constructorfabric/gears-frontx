/* The shadow root is the local stacking context, and the only host free of the
 * clipping and transforms an owning layer applies. */
export const resolvePortalContainer = (
  element: HTMLElement
): HTMLElement | ShadowRoot => {
  const root = element.getRootNode();

  if (root instanceof ShadowRoot) {
    return root;
  }

  return (
    element.closest<HTMLElement>('[role="dialog"]') ??
    element.parentElement ??
    element.ownerDocument.body
  );
};

/* A panel portaled out of its owner is no longer a descendant of it, so presses
 * inside it read as outside presses. Its anchor still marks where it belongs. */
const anchoredPanels = new Map<HTMLElement, HTMLElement>();

export const registerNestedLayer = (
  panel: HTMLElement,
  anchor: HTMLElement
): (() => void) => {
  anchoredPanels.set(panel, anchor);

  return () => {
    anchoredPanels.delete(panel);
  };
};

/** True while a layer anchored inside `host` is open, so `host` is not topmost. */
export const hasNestedLayer = (host: HTMLElement): boolean => {
  for (const [panel, anchor] of anchoredPanels) {
    if (panel !== host && host.contains(anchor)) {
      return true;
    }
  }

  return false;
};

/** True when the event happened inside a layer anchored in `host`. */
export const isNestedLayerEvent = (
  host: HTMLElement,
  path: readonly EventTarget[]
): boolean => {
  for (const [panel, anchor] of anchoredPanels) {
    if (panel !== host && host.contains(anchor) && path.includes(panel)) {
      return true;
    }
  }

  return false;
};

/* A scroll only unanchors a panel when the scrolled node contains its anchor;
 * scrolling inside the panel itself must keep it open. */
export const scrollMovesAnchor = (
  event: Event,
  anchor: HTMLElement | null
): boolean => {
  const { target } = event;

  if (anchor === null || !(target instanceof Node)) {
    return true;
  }

  let node: Node | null = anchor;

  while (node !== null) {
    if (node === target) {
      return true;
    }

    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
  }

  return false;
};
