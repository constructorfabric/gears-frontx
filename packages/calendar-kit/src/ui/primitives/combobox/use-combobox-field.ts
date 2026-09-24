import { useComboboxAnchor } from "@gears-frontx/ui-kit";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEvent,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
  Ref,
  RefObject,
} from "react";

import { subscribeGlobalEvent } from "../global-event-listener";
import { assignRef } from "../listbox-internals-utils";
import { resolvePortalContainer, scrollMovesAnchor } from "../portal-layer";
import { textFromNode } from "../react-node-text";
import type { ComboboxOption } from "./combobox";

const NO_SELECTED_VALUES: readonly string[] = [];

export type ComboboxSize = "l" | "m" | "xl" | "xxl";

export type ComboboxControlState = "locked" | "invalid" | "open" | "resting";

const resolveControlState = (
  disabled: boolean,
  readOnly: boolean,
  invalid: boolean,
  open: boolean
): ComboboxControlState => {
  if (disabled || readOnly) {
    return "locked";
  }
  if (invalid) {
    return "invalid";
  }
  if (open) {
    return "open";
  }
  return "resting";
};

const indexOptionsByValue = <Option extends { readonly value: string }>(
  options: readonly Option[]
): Map<string, Option> => {
  const index = new Map<string, Option>();

  for (const option of options) {
    if (!index.has(option.value)) {
      index.set(option.value, option);
    }
  }

  return index;
};

const parseSelectedValues = (key: string): string[] => {
  const parsed: unknown = JSON.parse(key);

  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === "string")
    : [];
};

interface ComboboxFieldOptions {
  readonly anchorRef: RefObject<HTMLElement | null> | undefined;
  readonly closeOnSelect: boolean;
  readonly disabled: boolean;
  readonly embedded: boolean;
  readonly emptyMessage: ReactNode;
  readonly id: string | undefined;
  readonly invalid: boolean;
  readonly loading: boolean;
  readonly loadingMessage: ReactNode;
  readonly onChange: ChangeEventHandler<HTMLInputElement> | undefined;
  readonly onClick: MouseEventHandler<HTMLInputElement> | undefined;
  readonly onFocus: FocusEventHandler<HTMLInputElement> | undefined;
  readonly onKeyDown: KeyboardEventHandler<HTMLInputElement> | undefined;
  readonly onPointerDown: PointerEventHandler<HTMLInputElement> | undefined;
  readonly onSearchChange: ((query: string) => void) | undefined;
  readonly onSelect: ((option: ComboboxOption) => void) | undefined;
  readonly onTagRemove: ((value: string) => void) | undefined;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly ComboboxOption[];
  readonly readOnly: boolean;
  readonly ref: Ref<HTMLInputElement> | undefined;
  readonly renderOption: ((option: ComboboxOption) => ReactNode) | undefined;
  readonly selectedValues: readonly string[] | undefined;
  readonly showChevron: boolean | undefined;
  readonly showSelectedCheck: boolean;
  readonly tags: boolean;
  readonly value: string;
}

export interface ComboboxField {
  readonly activeOptionId: string | undefined;
  readonly chipsAnchor: ReturnType<typeof useComboboxAnchor>;
  readonly controlAnchorRef: RefObject<HTMLDivElement | null>;
  readonly controlId: string;
  readonly controlState: ComboboxControlState;
  readonly emptyMessage: ReactNode;
  readonly filteredValues: readonly string[];
  readonly handleInputChange: ChangeEventHandler<HTMLInputElement>;
  readonly handleInputClick: MouseEventHandler<HTMLInputElement>;
  readonly handleInputFocus: FocusEventHandler<HTMLInputElement>;
  readonly handleInputKeyDown: KeyboardEventHandler<HTMLInputElement>;
  readonly handleInputPointerDown: PointerEventHandler<HTMLInputElement>;
  readonly handleInputValueChange: (nextValue: string) => void;
  readonly handleMultipleValueChange: (nextValues: readonly string[]) => void;
  readonly handleOpenChange: (nextOpen: boolean) => void;
  readonly handleOptionClick: (event: MouseEvent, value: string) => void;
  readonly handleOptionMouseEnter: (value: string) => void;
  readonly handleOptionPointerDown: (option: ComboboxOption) => void;
  readonly handleSingleValueChange: (nextValue: string | null) => void;
  readonly hasSelectedTags: boolean;
  readonly highlightedValue: string | null;
  readonly itemToStringLabel: (itemValue: string) => string;
  readonly loading: boolean;
  readonly loadingMessage: ReactNode;
  readonly open: boolean;
  readonly optionValues: readonly string[];
  readonly optionsByValue: ReadonlyMap<string, ComboboxOption>;
  readonly panelAnchor: RefObject<HTMLElement | null>;
  readonly portalContainer: HTMLElement | ShadowRoot | null;
  readonly renderOption: ((option: ComboboxOption) => ReactNode) | undefined;
  readonly rootRef: (element: HTMLDivElement | null) => void;
  readonly selectedTagOptions: readonly ComboboxOption[];
  readonly selectedValues: string[];
  readonly setInputRef: (element: HTMLInputElement | null) => void;
  readonly showChevron: boolean;
  readonly showSelectedCheck: boolean;
}

export const useComboboxField = ({
  anchorRef,
  closeOnSelect,
  disabled,
  embedded,
  emptyMessage,
  id,
  invalid,
  loading,
  loadingMessage,
  onChange,
  onClick,
  onFocus,
  onKeyDown,
  onPointerDown,
  onSearchChange,
  onSelect,
  onTagRemove,
  onValueChange,
  options,
  readOnly,
  ref,
  renderOption,
  selectedValues,
  showChevron,
  showSelectedCheck,
  tags,
  value,
}: ComboboxFieldOptions): ComboboxField => {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlAnchorRef = useRef<HTMLDivElement>(null);
  const portalContainerRef = useRef<HTMLElement | ShadowRoot | null>(null);

  const [portalContainer, setPortalContainer] = useState<
    HTMLElement | ShadowRoot | null
  >(null);

  const [open, setOpen] = useState(false);

  const setOpenAndPortal = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    const nextPortalContainer = nextOpen ? portalContainerRef.current : null;
    setPortalContainer((current) =>
      current === nextPortalContainer ? current : nextPortalContainer
    );
  }, []);

  const [searchOverride, setSearchOverride] = useState<{
    readonly query: string;
    readonly source: string;
  } | null>(null);

  const searchValue =
    searchOverride !== null && searchOverride.source === value
      ? searchOverride.query
      : value;

  const [activeValue, setActiveValue] = useState<string | null>(
    () => options.find((option) => option.disabled !== true)?.value ?? null
  );

  const keepOpenAfterSelect = useRef(false);
  const suppressNextPointerClick = useRef<string | null>(null);
  const inputWasFocusedOnPointerDown = useRef(false);

  const chipsAnchor = useComboboxAnchor();
  const panelAnchor = anchorRef ?? controlAnchorRef;

  const optionsByValue = useMemo(() => indexOptionsByValue(options), [options]);

  const optionValues = useMemo(
    () => options.map((option) => option.value),
    [options]
  );

  const filteredOptions = useMemo(
    () =>
      loading
        ? []
        : options.filter(
            (option) =>
              searchValue.trim() === "" ||
              textFromNode(option.label)
                .toLocaleLowerCase()
                .includes(searchValue.toLocaleLowerCase())
          ),
    [loading, options, searchValue]
  );

  const filteredValues = useMemo(
    () => filteredOptions.map((option) => option.value),
    [filteredOptions]
  );

  const highlightedValue = useMemo(() => {
    if (!open) {
      return activeValue;
    }
    if (
      activeValue !== null &&
      filteredOptions.some(
        (option) => option.value === activeValue && option.disabled !== true
      )
    ) {
      return activeValue;
    }
    return (
      filteredOptions.find((option) => option.disabled !== true)?.value ?? null
    );
  }, [activeValue, filteredOptions, open]);

  const activeOptionIndex =
    highlightedValue === null
      ? -1
      : options.findIndex((option) => option.value === highlightedValue);

  const activeOptionId =
    open && activeOptionIndex >= 0
      ? `${controlId}-${activeOptionIndex}`
      : undefined;

  const selectedValuesKey = JSON.stringify(
    selectedValues ?? NO_SELECTED_VALUES
  );

  const selectedValuesList = useMemo(
    () => parseSelectedValues(selectedValuesKey),
    [selectedValuesKey]
  );

  const selectedTagOptions = selectedValuesList.map(
    (selectedValue) =>
      optionsByValue.get(selectedValue) ?? {
        label: selectedValue,
        value: selectedValue,
      }
  );
  const hasSelectedTags = selectedTagOptions.length > 0;
  const resolvedShowChevron = showChevron ?? !embedded;
  const controlState = resolveControlState(disabled, readOnly, invalid, open);

  const setRootRef = useCallback((element: HTMLDivElement | null) => {
    rootRef.current = element;
    portalContainerRef.current =
      element === null ? null : resolvePortalContainer(element);
  }, []);

  const setInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element;
      assignRef(ref, element);
    },
    [ref]
  );

  useEffect(() => {
    const closeOnScroll = (event: Event) => {
      if (scrollMovesAnchor(event, inputRef.current)) {
        setOpenAndPortal(false);
      }
    };

    const unsubscribe = [
      subscribeGlobalEvent(document, "scroll", closeOnScroll, {
        capture: true,
        passive: true,
      }),
      subscribeGlobalEvent(document.body, "scroll", closeOnScroll, {
        capture: true,
        passive: true,
      }),
      subscribeGlobalEvent(window, "scroll", closeOnScroll, {
        capture: true,
        passive: true,
      }),
      subscribeGlobalEvent(portalContainer, "scroll", closeOnScroll, {
        capture: true,
        passive: true,
      }),
    ];

    return () => {
      for (const unsubscribeListener of unsubscribe) {
        unsubscribeListener();
      }
    };
  }, [portalContainer, setOpenAndPortal]);

  const handleInputValueChange = useCallback(
    (nextValue: string) => {
      if (readOnly || disabled) {
        return;
      }

      setSearchOverride({ query: nextValue, source: value });
      onValueChange(nextValue);
      onSearchChange?.(nextValue);

      if (tags || document.activeElement === inputRef.current) {
        setOpenAndPortal(true);
      }
    },
    [
      disabled,
      onSearchChange,
      onValueChange,
      readOnly,
      setOpenAndPortal,
      tags,
      value,
    ]
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!readOnly && !disabled) {
        onChange?.(event);
      }
    },
    [disabled, onChange, readOnly]
  );

  const handleInputFocus = useCallback<FocusEventHandler<HTMLInputElement>>(
    (event) => {
      onFocus?.(event);

      if (!readOnly && !disabled) {
        setOpenAndPortal(true);
      }
    },
    [disabled, onFocus, readOnly, setOpenAndPortal]
  );

  const handleInputPointerDown = useCallback<
    PointerEventHandler<HTMLInputElement>
  >(
    (event) => {
      onPointerDown?.(event);
      inputWasFocusedOnPointerDown.current =
        open || document.activeElement === event.currentTarget;
    },
    [onPointerDown, open]
  );

  const handleInputClick = useCallback<MouseEventHandler<HTMLInputElement>>(
    (event) => {
      onClick?.(event);

      if (event.defaultPrevented || readOnly || disabled) {
        return;
      }

      const wasAlreadyFocused = inputWasFocusedOnPointerDown.current;
      inputWasFocusedOnPointerDown.current = false;
      setOpenAndPortal(wasAlreadyFocused ? !open : true);
    },
    [disabled, onClick, open, readOnly, setOpenAndPortal]
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && keepOpenAfterSelect.current && !closeOnSelect) {
        keepOpenAfterSelect.current = false;
        setOpenAndPortal(true);
        return;
      }

      keepOpenAfterSelect.current = false;
      setOpenAndPortal(nextOpen);
    },
    [closeOnSelect, setOpenAndPortal]
  );

  const handleSingleValueChange = useCallback(
    (nextValue: string | null) => {
      if (nextValue === null) {
        return;
      }

      keepOpenAfterSelect.current = true;
      const option = optionsByValue.get(nextValue);

      if (option !== undefined) {
        onSelect?.(option);
      }
    },
    [onSelect, optionsByValue]
  );

  const handleMultipleValueChange = useCallback(
    (nextValues: readonly string[]) => {
      keepOpenAfterSelect.current = true;
      const previousValues = selectedValues ?? NO_SELECTED_VALUES;
      const nextValueSet = new Set(nextValues);
      const previousValueSet = new Set(previousValues);

      for (const nextValue of nextValues) {
        if (previousValueSet.has(nextValue)) {
          continue;
        }

        const option = optionsByValue.get(nextValue);

        if (option !== undefined) {
          onSelect?.(option);
        }
      }

      for (const previousValue of previousValues) {
        if (nextValueSet.has(previousValue)) {
          continue;
        }

        if (onTagRemove !== undefined) {
          onTagRemove(previousValue);
          continue;
        }

        onSelect?.(
          optionsByValue.get(previousValue) ?? {
            label: previousValue,
            value: previousValue,
          }
        );
      }
    },
    [onSelect, onTagRemove, optionsByValue, selectedValues]
  );

  const handleOptionPointerDown = useCallback(
    (option: ComboboxOption) => {
      if (option.disabled === true || readOnly || disabled) {
        return;
      }

      setActiveValue(option.value);
      suppressNextPointerClick.current = option.value;

      if (tags) {
        const previousValues = selectedValues ?? NO_SELECTED_VALUES;

        const nextValues = previousValues.includes(option.value)
          ? previousValues.filter(
              (selectedValue) => selectedValue !== option.value
            )
          : [...previousValues, option.value];
        handleMultipleValueChange(nextValues);
      } else {
        handleSingleValueChange(option.value);
      }

      keepOpenAfterSelect.current = false;
      setOpenAndPortal(!closeOnSelect);
    },
    [
      closeOnSelect,
      disabled,
      handleMultipleValueChange,
      handleSingleValueChange,
      readOnly,
      selectedValues,
      setOpenAndPortal,
      tags,
    ]
  );

  const handleOptionClick = useCallback(
    (event: MouseEvent, optionValue: string): void => {
      if (suppressNextPointerClick.current !== optionValue) {
        return;
      }

      suppressNextPointerClick.current = null;
      event.preventDefault();
      // SAFETY: Base UI supplies this private cancellation hook on item pointer events.
      const { preventBaseUIHandler } = event as MouseEvent & {
        preventBaseUIHandler?: () => void;
      };
      preventBaseUIHandler?.();
    },
    []
  );

  const navigateHighlightedOption = useCallback(
    (key: string) => {
      const navigableOptions = filteredOptions.filter(
        (option) => option.disabled !== true
      );

      if (navigableOptions.length === 0) {
        setActiveValue(null);
        return;
      }

      const currentIndex = navigableOptions.findIndex(
        (option) => option.value === highlightedValue
      );
      let nextIndex: number;

      if (key === "Home") {
        nextIndex = 0;
      } else if (key === "End") {
        nextIndex = navigableOptions.length - 1;
      } else if (currentIndex === -1) {
        nextIndex = key === "ArrowDown" ? 0 : navigableOptions.length - 1;
      } else {
        const direction = key === "ArrowDown" ? 1 : -1;
        nextIndex =
          (currentIndex + direction + navigableOptions.length) %
          navigableOptions.length;
      }

      setActiveValue(navigableOptions[nextIndex]?.value ?? null);
      setOpenAndPortal(true);
    },
    [filteredOptions, highlightedValue, setOpenAndPortal]
  );

  const commitHighlightedOption = useCallback(() => {
    if (!open || highlightedValue === null) {
      inputRef.current?.focus();
      setOpenAndPortal(false);
      return;
    }

    if (tags) {
      const previousValues = selectedValues ?? NO_SELECTED_VALUES;

      const nextValues = previousValues.includes(highlightedValue)
        ? previousValues.filter(
            (selectedValue) => selectedValue !== highlightedValue
          )
        : [...previousValues, highlightedValue];
      handleMultipleValueChange(nextValues);
    } else {
      handleSingleValueChange(highlightedValue);
    }

    inputRef.current?.focus();
    setOpenAndPortal(!closeOnSelect);
  }, [
    closeOnSelect,
    handleMultipleValueChange,
    handleSingleValueChange,
    highlightedValue,
    open,
    selectedValues,
    setOpenAndPortal,
    tags,
  ]);

  const handleInputKeyDown = useCallback<
    KeyboardEventHandler<HTMLInputElement>
  >(
    (event) => {
      onKeyDown?.(event);

      if (event.defaultPrevented || readOnly || disabled) {
        return;
      }

      // SAFETY: Base UI supplies this private cancellation hook on input keyboard events.
      const { preventBaseUIHandler } = event as typeof event & {
        preventBaseUIHandler?: () => void;
      };
      const { key } = event;

      if (
        key === "ArrowDown" ||
        key === "ArrowUp" ||
        key === "Home" ||
        key === "End"
      ) {
        event.preventDefault();
        preventBaseUIHandler?.();
        navigateHighlightedOption(key);
        return;
      }

      if (key === "Escape" || key === "Tab") {
        event.preventDefault();
        preventBaseUIHandler?.();

        if (key === "Escape") {
          inputRef.current?.focus();
        }

        setOpenAndPortal(false);
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        preventBaseUIHandler?.();
        commitHighlightedOption();
        return;
      }

      if (key === " ") {
        event.preventDefault();
        preventBaseUIHandler?.();
        setOpenAndPortal(true);
      }
    },
    [
      commitHighlightedOption,
      disabled,
      navigateHighlightedOption,
      onKeyDown,
      readOnly,
      setOpenAndPortal,
    ]
  );

  const itemToStringLabel = useCallback(
    (itemValue: string) => {
      const option = optionsByValue.get(itemValue);

      return option === undefined
        ? itemValue
        : textFromNode(option.label) || option.value;
    },
    [optionsByValue]
  );

  return {
    activeOptionId,
    chipsAnchor,
    controlAnchorRef,
    controlId,
    controlState,
    emptyMessage,
    filteredValues,
    handleInputChange,
    handleInputClick,
    handleInputFocus,
    handleInputKeyDown,
    handleInputPointerDown,
    handleInputValueChange,
    handleMultipleValueChange,
    handleOpenChange,
    handleOptionClick,
    handleOptionMouseEnter: setActiveValue,
    handleOptionPointerDown,
    handleSingleValueChange,
    hasSelectedTags,
    highlightedValue,
    itemToStringLabel,
    loading,
    loadingMessage,
    open,
    optionValues,
    optionsByValue,
    panelAnchor,
    portalContainer,
    renderOption,
    rootRef: setRootRef,
    selectedTagOptions,
    selectedValues: selectedValuesList,
    setInputRef,
    showChevron: resolvedShowChevron,
    showSelectedCheck,
  };
};
