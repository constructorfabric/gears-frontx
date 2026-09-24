import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { subscribeGlobalEvent } from "./global-event-listener";
import type {
  ListboxOption,
  UseListboxControllerOptions,
  UseListboxControllerResult,
} from "./listbox-internals";
import {
  firstEnabledIndex,
  isEnabled,
  lastEnabledIndex,
  moveToEnabledIndex,
  resolveActiveIndex,
} from "./listbox-internals-utils";
import { textFromNode } from "./react-node-text";

const TYPEAHEAD_WINDOW_MS = 500;
const TYPEAHEAD_KEY = /^[a-z0-9]$/iu;

export const useListboxController = <Value extends string>({
  anchorRef,
  panelRef,
  options,
  selectedIndex,
  disabled = false,
  closeOnSelect = true,
  selectOnSpace = true,
  typeahead = false,
  focusTrigger,
  onSelect,
}: UseListboxControllerOptions<Value>): UseListboxControllerResult<Value> => {
  const [open, setOpen] = useState(false);

  const [activeIndex, setActiveIndex] = useState(() =>
    resolveActiveIndex(options, selectedIndex)
  );

  const typeaheadBufferRef = useRef("");
  // `0` is never a live timer id, so it doubles as the "no pending timer" value.
  const typeaheadTimerRef = useRef(0);

  const resolvedActiveIndex = isEnabled(options[activeIndex])
    ? activeIndex
    : resolveActiveIndex(options, selectedIndex);

  const activeOption = options[resolvedActiveIndex];

  const resetTypeahead = useCallback(() => {
    window.clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = 0;
    typeaheadBufferRef.current = "";
  }, []);

  const closeListbox = useCallback(() => {
    setOpen(false);
    resetTypeahead();
  }, [resetTypeahead]);

  const closeAndFocusTrigger = useCallback(() => {
    closeListbox();
    focusTrigger();
  }, [closeListbox, focusTrigger]);

  const openListbox = useCallback(
    (preferredIndex = selectedIndex) => {
      setActiveIndex(resolveActiveIndex(options, preferredIndex));
      setOpen(true);
    },
    [options, selectedIndex]
  );

  const toggleListbox = useCallback(
    (preferredIndex = selectedIndex) => {
      if (open) {
        closeListbox();
        return;
      }

      openListbox(preferredIndex);
    },
    [closeListbox, open, openListbox, selectedIndex]
  );

  const selectOption = useCallback(
    (option: ListboxOption<Value>) => {
      const currentOption = options.find(
        (candidate) => candidate.value === option.value
      );

      if (!isEnabled(currentOption)) {
        return;
      }

      onSelect(currentOption);

      if (closeOnSelect) {
        closeAndFocusTrigger();
        return;
      }

      focusTrigger();
    },
    [closeAndFocusTrigger, closeOnSelect, focusTrigger, onSelect, options]
  );

  useEffect(() => resetTypeahead, [resetTypeahead]);

  useEffect(() => {
    if (!open) {
      return () => {
        // Nothing is subscribed while closed.
      };
    }

    const closeWhenOutsideAnchor = (event: Event) => {
      const path = event.composedPath();
      const anchor = anchorRef.current;
      const panel = panelRef?.current;

      const insideAnchor = anchor ? path.includes(anchor) : false;

      const insidePanel = panel ? path.includes(panel) : false;

      if (anchor && !insideAnchor && !insidePanel) {
        closeListbox();
      }
    };

    const unsubscribePointer = subscribeGlobalEvent(
      document,
      "pointerdown",
      closeWhenOutsideAnchor,
      true
    );
    const unsubscribeScroll = subscribeGlobalEvent(
      document,
      "scroll",
      closeWhenOutsideAnchor,
      { capture: true, passive: true }
    );

    return () => {
      unsubscribePointer();
      unsubscribeScroll();
    };
  }, [anchorRef, closeListbox, open, panelRef]);

  const moveTypeahead = useCallback(
    (key: string) => {
      window.clearTimeout(typeaheadTimerRef.current);

      const buffer = `${typeaheadBufferRef.current}${key.toLowerCase()}`;
      typeaheadBufferRef.current = buffer;
      typeaheadTimerRef.current = window.setTimeout(
        resetTypeahead,
        TYPEAHEAD_WINDOW_MS
      );

      const match = options.findIndex(
        (option) =>
          isEnabled(option) &&
          textFromNode(option.label).toLowerCase().startsWith(buffer)
      );

      if (match !== -1) {
        setActiveIndex(match);
      }
    },
    [options, resetTypeahead]
  );

  const moveActiveFromArrowKey = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      event.preventDefault();

      if (!open) {
        openListbox();
        return;
      }

      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(moveToEnabledIndex(options, resolvedActiveIndex, delta));
    },
    [open, openListbox, options, resolvedActiveIndex]
  );

  const moveActiveToEdgeKey = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      event.preventDefault();

      const edgeIndex =
        event.key === "Home"
          ? firstEnabledIndex(options)
          : lastEnabledIndex(options);

      if (open) {
        setActiveIndex(edgeIndex);
        return;
      }

      openListbox(edgeIndex);
    },
    [open, openListbox, options]
  );

  const commitActiveOption = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === " " && !selectOnSpace) {
        return;
      }

      event.preventDefault();

      if (!open) {
        openListbox();
        return;
      }

      if (isEnabled(activeOption)) {
        selectOption(activeOption);
      }
    },
    [activeOption, open, openListbox, selectOnSpace, selectOption]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }

      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp": {
          moveActiveFromArrowKey(event);
          return;
        }

        case "Home":
        case "End": {
          moveActiveToEdgeKey(event);
          return;
        }

        case "Enter":
        case " ": {
          commitActiveOption(event);
          return;
        }

        case "Escape": {
          if (!open) {
            return;
          }

          event.preventDefault();
          closeAndFocusTrigger();
          return;
        }

        case "Tab": {
          if (open) {
            closeListbox();
          }
          return;
        }

        default: {
          if (typeahead && open && TYPEAHEAD_KEY.test(event.key)) {
            moveTypeahead(event.key);
          }
        }
      }
    },
    [
      closeAndFocusTrigger,
      closeListbox,
      commitActiveOption,
      disabled,
      moveActiveFromArrowKey,
      moveActiveToEdgeKey,
      moveTypeahead,
      open,
      typeahead,
    ]
  );

  return {
    activeIndex: resolvedActiveIndex,
    activeOption: isEnabled(activeOption) ? activeOption : undefined,
    closeAndFocusTrigger,
    closeListbox,
    handleKeyDown,
    open,
    openListbox,
    selectOption,
    setActiveIndex,
    toggleListbox,
  };
};
