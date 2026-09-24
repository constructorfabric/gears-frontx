import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

import { useControlledValue } from "../hooks/use-controlled-value";

export interface CalendarSidePanelControllerOptions {
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onClose: () => void;
  readonly query?: string;
  readonly defaultQuery?: string;
  readonly onQueryChange?: (query: string) => void;
}

export interface CalendarSidePanelControllerResult {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly clearQuery: () => void;
  readonly toggleRef: RefObject<HTMLButtonElement | null>;
}

const activeElementFor = (toggle: HTMLButtonElement | null): Element | null => {
  const root = toggle?.getRootNode();

  return root instanceof ShadowRoot
    ? root.activeElement
    : (toggle?.ownerDocument.activeElement ?? document.activeElement);
};

const needsFocus = (toggle: HTMLButtonElement | null): boolean => {
  const active = activeElementFor(toggle);

  if (!active) {
    return true;
  }
  return active === active.ownerDocument.body || !active.isConnected;
};

export const useCalendarSidePanelController = (
  options: CalendarSidePanelControllerOptions
): CalendarSidePanelControllerResult => {
  const {
    open,
    defaultOpen,
    onOpenChange,
    onClose,
    query,
    defaultQuery = "",
    onQueryChange,
  } = options;

  const openState = useControlledValue({
    defaultValue: defaultOpen ?? false,
    onChange: onOpenChange,
    value: open,
  });

  const { value: isOpen, setValue: setOpen } = openState;

  const queryState = useControlledValue({
    defaultValue: defaultQuery,
    onChange: onQueryChange,
    value: query,
  });

  const { value: currentQuery, setValue: setQuery } = queryState;

  const toggleRef = useRef<HTMLButtonElement>(null);
  const previousOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = isOpen;

    if (!isOpen || wasOpen || !needsFocus(toggleRef.current)) {
      return;
    }

    toggleRef.current?.focus();
  }, [isOpen]);

  const openPanel = useCallback((): void => {
    setOpen(true);
  }, [setOpen]);

  const close = useCallback((): void => {
    setOpen(false);
    onClose();
  }, [onClose, setOpen]);

  const clearQuery = useCallback((): void => {
    setQuery("");
  }, [setQuery]);

  return {
    clearQuery,
    close,
    isOpen,
    open: openPanel,
    query: currentQuery,
    setQuery,
    toggleRef,
  };
};
