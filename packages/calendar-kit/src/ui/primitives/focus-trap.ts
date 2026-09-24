const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export const collectFocusable = (
  panel: HTMLElement | null
): readonly HTMLElement[] => {
  if (panel === null) {
    return [];
  }

  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true"
  );
};

export const resolveActiveElement = (
  panel: HTMLElement | null
): HTMLElement | null => {
  if (panel === null) {
    return null;
  }

  const root = panel.getRootNode();

  const active =
    root instanceof ShadowRoot
      ? root.activeElement
      : panel.ownerDocument.activeElement;

  return active instanceof HTMLElement ? active : null;
};

export interface TabKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  preventDefault: () => void;
}

export const cycleTabFocus = (
  event: TabKeyEvent,
  panel: HTMLElement | null,
  focusOptions?: FocusOptions
): void => {
  if (event.key !== "Tab" || panel === null) {
    return;
  }

  const focusable = collectFocusable(panel);

  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus(focusOptions);
    return;
  }

  const [first] = focusable;
  const last = focusable.at(-1) ?? first;
  const active = resolveActiveElement(panel);

  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus(focusOptions);
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus(focusOptions);
  }
};
