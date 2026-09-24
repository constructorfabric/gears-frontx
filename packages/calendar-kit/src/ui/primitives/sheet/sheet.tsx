import { clsx } from "clsx";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
} from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { createPortal } from "react-dom";

import { cycleTabFocus, resolveActiveElement } from "../focus-trap";
import { noopCleanup, subscribeGlobalEvent } from "../global-event-listener";
import { assignRef } from "../listbox-internals-utils";

import styles from "./sheet.module.css";

const SheetCloseContext = createContext<() => void>(() => {
  // Always rendered under a provider.
});

export const useSheetClose = (): (() => void) => useContext(SheetCloseContext);

const SHEET_SIDE = {
  end: "end",
  start: "start",
} as const;

type SheetSide = (typeof SHEET_SIDE)[keyof typeof SHEET_SIDE];

interface SheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label: string;
  readonly labelledBy?: string;
  readonly side?: SheetSide;
  readonly className?: string;
  readonly testId?: string;
  readonly container?: Element | DocumentFragment;
  readonly ref?: Ref<HTMLElement>;
  readonly children: ReactNode;
}

const Sheet = ({
  open,
  onOpenChange,
  label,
  labelledBy,
  side = SHEET_SIDE.end,
  className,
  testId,
  container,
  ref,
  children,
}: SheetProps) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const originRef = useRef<HTMLElement | null>(null);

  const requestClose = useCallback((): void => {
    onOpenChange(false);
  }, [onOpenChange]);

  const closeSheet = useEffectEvent((): void => {
    requestClose();
  });

  const setPanelRef = useCallback(
    (element: HTMLElement | null): void => {
      panelRef.current = element;
      element?.setAttribute("role", "dialog");
      assignRef(ref, element);
    },
    [ref]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      requestClose();

      return;
    }

    cycleTabFocus(event, panelRef.current);
  };

  useEffect(() => {
    if (!open) {
      originRef.current?.focus();
      originRef.current = null;

      return noopCleanup;
    }

    const panel = panelRef.current;

    if (!panel) {
      return noopCleanup;
    }

    originRef.current = resolveActiveElement(panel);
    panel.focus({ preventScroll: true });

    return () => {
      originRef.current?.focus();
      originRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return noopCleanup;
    }

    const panel = panelRef.current;
    const root = panel?.getRootNode();

    if (!panel || !(root instanceof Document || root instanceof ShadowRoot)) {
      return noopCleanup;
    }

    const handlePointerDown = (event: Event): void => {
      if (!event.composedPath().includes(panel)) {
        closeSheet();
      }
    };

    const unsubscribe = subscribeGlobalEvent(
      root,
      "mousedown",
      handlePointerDown
    );

    return unsubscribe;
  }, [open]);

  if (!open) {
    return null;
  }

  const panelClassName = clsx(
    styles.panel,
    side === SHEET_SIDE.start ? styles.panelStart : styles.panelEnd,
    className
  );

  const content = (
    <>
      <div aria-hidden="true" className={styles.scrim} />
      <dialog
        open
        ref={setPanelRef}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={panelClassName}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        id={testId}
      >
        {children}
      </dialog>
    </>
  );

  return (
    <SheetCloseContext.Provider value={requestClose}>
      {container ? createPortal(content, container) : content}
    </SheetCloseContext.Provider>
  );
};

Sheet.displayName = "Sheet";

export { Sheet };
