import {
  Select as UiSelect,
  SelectContent as UiSelectContent,
  SelectGroup as UiSelectGroup,
  SelectItem as UiSelectItem,
  SelectSeparator as UiSelectSeparator,
  SelectTrigger as UiSelectTrigger,
  SelectValue as UiSelectValue,
} from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import {
  Fragment,
  isValidElement,
  useCallback,
  useMemo,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  Ref,
} from "react";

import { noopCleanup, subscribeGlobalEvent } from "../global-event-listener";
import {
  registerNestedLayer,
  resolvePortalContainer,
  scrollMovesAnchor,
} from "../portal-layer";
import {
  flattenNodeList,
  isPresentNode,
  textFromNode,
} from "../react-node-text";

import styles from "./select.module.css";

const SELECT_TRIGGER_SIZES = {
  l: "default",
  m: "sm",
  xl: "default",
  xxl: "default",
} as const;

const SELECT_SIZE_CLASSES = {
  l: styles.sizeL,
  m: styles.sizeM,
  xl: styles.sizeXl,
  xxl: styles.sizeXxl,
} as const;

type SelectSize = keyof typeof SELECT_SIZE_CLASSES;

const selectItemText = (node: ReactNode): string =>
  flattenNodeList(node)
    .map((child) => {
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return child.type === Fragment
          ? selectItemText(child.props.children)
          : "";
      }
      return textFromNode(child);
    })
    .join("");

export interface SelectOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly dividerAfter?: boolean;
}

interface SelectItem {
  readonly label: string;
  readonly value: string;
}

const parseSelectItems = (key: string): SelectItem[] => {
  const parsed: unknown = JSON.parse(key);

  return Array.isArray(parsed)
    ? parsed.filter(
        (entry: unknown): entry is SelectItem =>
          typeof entry === "object" &&
          entry !== null &&
          "label" in entry &&
          typeof entry.label === "string" &&
          "value" in entry &&
          typeof entry.value === "string"
      )
    : [];
};

interface SelectProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "disabled" | "type" | "value"
> {
  readonly id?: string;
  readonly options: readonly SelectOption[];
  readonly value?: string;
  readonly onValueChange: (value: string) => void;
  readonly size?: SelectSize;
  readonly invalid?: boolean;
  readonly placeholder?: string;
  readonly emptyMessage?: ReactNode;
  readonly label?: ReactNode;
  readonly message?: ReactNode;
  readonly disabled?: boolean;
  readonly iconLeft?: ReactNode;
  readonly showSelectedCheck?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

const findEnabledIndex = (
  options: readonly SelectOption[],
  start: number,
  direction: 1 | -1
): number => {
  if (options.length === 0) {
    return -1;
  }

  let index = start;

  for (const _ of options) {
    index = (index + options.length) % options.length;

    if (options[index]?.disabled !== true) {
      return index;
    }

    index += direction;
  }

  return -1;
};

type SelectIndexUpdate = number | ((currentIndex: number) => number);

interface SelectPopupProps {
  readonly activeIndex: number;
  readonly anchor: HTMLElement | null;
  readonly emptyMessage?: ReactNode;
  readonly onActiveIndexChange: (nextIndex: SelectIndexUpdate) => void;
  readonly onClose: () => void;
  readonly onValueChange: (value: string) => void;
  readonly open: boolean;
  readonly options: readonly SelectOption[];
  readonly optionIndexByOption: ReadonlyMap<SelectOption, number>;
  readonly portalContainer: HTMLElement | ShadowRoot;
  readonly popupId: string;
  readonly showSelectedCheck: boolean;
}

const SelectPopup = ({
  activeIndex,
  anchor,
  emptyMessage,
  onActiveIndexChange,
  onClose,
  onValueChange,
  options,
  optionIndexByOption,
  portalContainer,
  popupId,
  showSelectedCheck,
}: SelectPopupProps) => {
  const handlePopupPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const { target } = event;

      if (!(target instanceof Element)) {
        return;
      }

      const option = target.closest<HTMLElement>('[role="option"]');

      if (option?.getAttribute("aria-disabled") !== "true") {
        option?.click();
      }
    },
    []
  );

  const handlePopupKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const { target } = event;

      if (!(target instanceof Element) || target.closest('[role="option"]')) {
        return;
      }

      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        onClose();

        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        onActiveIndexChange((current) =>
          findEnabledIndex(
            options,
            current + (event.key === "ArrowDown" ? 1 : -1),
            event.key === "ArrowDown" ? 1 : -1
          )
        );

        return;
      }

      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        onActiveIndexChange(
          findEnabledIndex(
            options,
            event.key === "Home" ? 0 : options.length - 1,
            event.key === "Home" ? 1 : -1
          )
        );

        return;
      }

      if (event.key.length === 1 && event.key !== " ") {
        const match = options.findIndex(
          (option) =>
            option.disabled !== true &&
            textFromNode(option.label)
              .toLocaleLowerCase()
              .startsWith(event.key.toLocaleLowerCase())
        );

        if (match !== -1) {
          onActiveIndexChange(match);
        }

        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const option = event.currentTarget.querySelector<HTMLElement>(
        "[data-calendar-active]"
      );

      if (option === null || option.getAttribute("aria-disabled") === "true") {
        return;
      }

      const selectedOption = options[activeIndex];

      if (selectedOption === undefined || selectedOption.disabled === true) {
        return;
      }

      event.preventDefault();
      onValueChange(selectedOption.value);
      onClose();
    },
    [activeIndex, onActiveIndexChange, onClose, onValueChange, options]
  );

  const [popup, setPopup] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (popup === null || anchor === null) {
      return noopCleanup;
    }

    return registerNestedLayer(popup, anchor);
  }, [anchor, popup]);

  return (
    <UiSelectContent
      ref={setPopup}
      id={popupId}
      container={portalContainer}
      className={styles.popup}
      onPointerDown={handlePopupPointerDown}
      onKeyDown={handlePopupKeyDown}
    >
      {options.length === 0 && isPresentNode(emptyMessage) ? (
        <p role="status" className={styles.panelMessage}>
          {emptyMessage}
        </p>
      ) : null}
      <UiSelectGroup onKeyDown={handlePopupKeyDown}>
        {options.map((option) => (
          <Fragment key={option.value}>
            <UiSelectItem
              value={option.value}
              disabled={option.disabled === true}
              label={selectItemText(option.label).trim() || option.value}
              data-calendar-active={
                activeIndex === (optionIndexByOption.get(option) ?? -1)
                  ? ""
                  : undefined
              }
              onMouseEnter={() => {
                onActiveIndexChange(optionIndexByOption.get(option) ?? -1);
              }}
              className={clsx(
                styles.item,
                !showSelectedCheck && styles.itemNoCheck
              )}
            >
              <span aria-hidden="true" className={styles.optionIndent} />
              {isPresentNode(option.icon) ? (
                <span aria-hidden="true" className={styles.optionIcon}>
                  {option.icon}
                </span>
              ) : null}
              <div className={styles.optionText}>{option.label}</div>
            </UiSelectItem>
            {option.dividerAfter === true ? (
              <UiSelectSeparator className={styles.separator} />
            ) : null}
          </Fragment>
        ))}
      </UiSelectGroup>
    </UiSelectContent>
  );
};

const getInitialSelectedIndex = (
  options: readonly SelectOption[],
  value: string | undefined
): number => {
  const selectedIndex = options.findIndex((option) => option.value === value);

  return selectedIndex === -1 ? -1 : selectedIndex;
};

const getLabelledBy = (
  ariaLabelledBy: string | undefined,
  hasLabel: boolean,
  ariaLabel: string | undefined,
  labelId: string
): string | undefined => {
  if (ariaLabelledBy !== undefined) {
    return ariaLabelledBy;
  }
  return hasLabel && ariaLabel === undefined ? labelId : undefined;
};

export const Select = ({
  ref,
  id,
  options,
  value,
  onValueChange,
  size = "l",
  invalid = false,
  placeholder = "",
  emptyMessage,
  showSelectedCheck = false,
  label,
  message,
  disabled = false,
  iconLeft,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  onKeyDown,
  ...props
}: SelectProps): ReactNode => {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const labelId = `${controlId}-label`;
  const messageId = `${controlId}-message`;
  const hasLabel = isPresentNode(label);
  const hasMessage = isPresentNode(message);
  const describedBy = [hasMessage ? messageId : undefined, ariaDescribedBy]
    .filter(Boolean)
    .join(" ");
  const labelledBy = getLabelledBy(
    ariaLabelledBy,
    hasLabel,
    ariaLabel,
    labelId
  );

  const portalContainerRef = useRef<HTMLElement | ShadowRoot | null>(null);

  const [portalContainer, setPortalContainer] = useState<
    HTMLElement | ShadowRoot | null
  >(null);

  const [open, setOpen] = useState(false);

  const updateOpen = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    const nextPortalContainer = nextOpen ? portalContainerRef.current : null;
    setPortalContainer((current) =>
      current === nextPortalContainer ? current : nextPortalContainer
    );
  }, []);

  const triggerRef = useRef<HTMLButtonElement>(null);

  const [triggerElement, setTriggerElement] =
    useState<HTMLButtonElement | null>(null);

  const [activeIndex, setActiveIndex] = useState(() =>
    getInitialSelectedIndex(options, value)
  );

  const popupId = `${controlId}-listbox`;

  const optionIndexByOption = useMemo(
    () => new Map(options.map((option, index) => [option, index])),
    [options]
  );

  const setRootRef = useCallback((element: HTMLDivElement | null) => {
    portalContainerRef.current =
      element === null ? null : resolvePortalContainer(element);
  }, []);

  const setTriggerRef = useCallback(
    (element: HTMLButtonElement | null) => {
      triggerRef.current = element;
      setTriggerElement(element);

      if (!ref) {
        return;
      }

      if ("current" in ref) {
        ref.current = element;
      } else {
        ref(element);
      }
    },
    [ref]
  );

  useEffect(() => {
    if (!open) {
      return noopCleanup;
    }

    const closeOnScroll = (event: Event) => {
      if (scrollMovesAnchor(event, triggerRef.current)) {
        updateOpen(false);
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
  }, [open, portalContainer, updateOpen]);

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);

      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        updateOpen(true);
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const selectedIndex = options.findIndex(
          (option) => option.value === value
        );
        setActiveIndex(
          findEnabledIndex(
            options,
            selectedIndex +
              (event.key === "ArrowDown" ? 0 : options.length - 1),
            event.key === "ArrowDown" ? 1 : -1
          )
        );
        updateOpen(true);
      }
    },
    [onKeyDown, options, updateOpen, value]
  );

  const closePopup = useCallback(() => {
    updateOpen(false);
    triggerRef.current?.focus();
  }, [updateOpen]);

  const optionSignature = JSON.stringify(
    options.map((option) => {
      const itemLabel = selectItemText(option.label).trim();

      return { label: itemLabel || option.value, value: option.value };
    })
  );

  const items = useMemo(
    () => parseSelectItems(optionSignature),
    [optionSignature]
  );

  const handleValueChange = useCallback(
    (nextValue: string | null) => {
      if (nextValue !== null) {
        onValueChange(nextValue);
      }
    },
    [onValueChange]
  );

  const handleOpenChange = (nextOpen: boolean): void => {
    updateOpen(nextOpen);

    if (!nextOpen) {
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={setRootRef} className={clsx(styles.field, className)}>
      {hasLabel ? (
        <label id={labelId} htmlFor={controlId} className={styles.topLabel}>
          {label}
        </label>
      ) : null}

      <UiSelect
        id={controlId}
        items={items}
        value={value ?? null}
        disabled={disabled}
        open={open}
        onOpenChange={handleOpenChange}
        onValueChange={handleValueChange}
      >
        <UiSelectTrigger
          {...props}
          ref={setTriggerRef}
          id={controlId}
          disabled={disabled}
          aria-invalid={invalid ? true : ariaInvalid}
          aria-describedby={describedBy || undefined}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          onKeyDown={handleTriggerKeyDown}
          size={SELECT_TRIGGER_SIZES[size]}
          className={clsx(styles.trigger, SELECT_SIZE_CLASSES[size])}
        >
          {isPresentNode(iconLeft) ? (
            <span aria-hidden="true" className={styles.triggerIcon}>
              {iconLeft}
            </span>
          ) : null}
          <UiSelectValue
            placeholder={placeholder}
            className={clsx(
              styles.value,
              (value === undefined || value === "") && styles.placeholder
            )}
          />
        </UiSelectTrigger>

        {portalContainer === null ? null : (
          <SelectPopup
            activeIndex={activeIndex}
            anchor={triggerElement}
            emptyMessage={emptyMessage}
            onActiveIndexChange={setActiveIndex}
            onClose={closePopup}
            onValueChange={onValueChange}
            open={open}
            options={options}
            optionIndexByOption={optionIndexByOption}
            portalContainer={portalContainer}
            popupId={popupId}
            showSelectedCheck={showSelectedCheck}
          />
        )}
      </UiSelect>

      {hasMessage ? (
        <p
          id={messageId}
          role={invalid ? "alert" : undefined}
          className={clsx(styles.message, invalid && styles.messageInvalid)}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
};

Select.displayName = "Select";
