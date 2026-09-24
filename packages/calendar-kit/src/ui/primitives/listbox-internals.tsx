import { clsx } from "clsx";
import { Check } from "lucide-react";
import { Activity, useCallback, useLayoutEffect, useRef } from "react";
import type {
  HTMLAttributes,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
  RefObject,
} from "react";

import {
  assignRef,
  getListboxOptionId,
  resolveActiveOptionId,
} from "./listbox-internals-utils";
import { hasRenderableContent, isPresentNode } from "./react-node-text";
import { useFloatingPanel } from "./use-floating-panel/use-floating-panel";

import styles from "./listbox-internals.module.css";

export interface ListboxOption<Value extends string = string> {
  readonly id?: string;
  readonly value: Value;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly checked?: boolean;
  readonly leftIcon?: ReactNode;
  readonly rightIcon?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly support?: ReactNode;
  readonly avatar?: ReactNode;
  readonly divider?: boolean;
}

export interface ListboxProps<Value extends string = string> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "id" | "role"
> {
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly open?: boolean;
  readonly id?: string;
  readonly options: readonly ListboxOption<Value>[];
  readonly activeIndex?: number;
  readonly onActiveIndexChange?: (index: number) => void;
  readonly onOptionSelect: (option: ListboxOption<Value>) => void;
  readonly optionIdPrefix?: string;
  readonly emptyContent?: ReactNode;
  readonly scrollActiveOptionIntoView?: boolean;
  readonly ref?: Ref<HTMLDivElement>;
}

export interface UseListboxControllerOptions<Value extends string> {
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly panelRef?: RefObject<HTMLDivElement | null>;
  readonly options: readonly ListboxOption<Value>[];
  readonly selectedIndex?: number;
  readonly disabled?: boolean;
  readonly closeOnSelect?: boolean;
  readonly selectOnSpace?: boolean;
  readonly typeahead?: boolean;
  readonly focusTrigger: () => void;
  readonly onSelect: (option: ListboxOption<Value>) => void;
}

export interface UseListboxControllerResult<Value extends string> {
  readonly open: boolean;
  readonly activeIndex: number;
  readonly activeOption: ListboxOption<Value> | undefined;
  readonly openListbox: (preferredIndex?: number) => void;
  readonly toggleListbox: (preferredIndex?: number) => void;
  readonly closeListbox: () => void;
  readonly closeAndFocusTrigger: () => void;
  readonly selectOption: (option: ListboxOption<Value>) => void;
  readonly setActiveIndex: (index: number) => void;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export const Listbox = <Value extends string>({
  ref,
  anchorRef,
  open = true,
  id,
  options,
  activeIndex = -1,
  onActiveIndexChange,
  onOptionSelect,
  optionIdPrefix = "listbox-option",
  emptyContent,
  scrollActiveOptionIntoView = false,
  className,
  style,
  ...props
}: ListboxProps<Value>) => {
  const { panelRef, position } = useFloatingPanel(open, anchorRef);

  const activeOptionRef = useRef<HTMLButtonElement | null>(null);
  const pointerSelectedValueRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!open || !scrollActiveOptionIntoView || activeIndex < 0) {
      return;
    }

    activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, scrollActiveOptionIntoView]);

  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      assignRef(ref, node);
    },
    [panelRef, ref]
  );

  if (options.length === 0 && !hasRenderableContent(emptyContent)) {
    return null;
  }

  return (
    <Activity mode={open ? "visible" : "hidden"}>
      <div
        tabIndex={-1}
        {...props}
        ref={setPanelRef}
        id={id}
        role="listbox"
        aria-activedescendant={resolveActiveOptionId(
          options[activeIndex],
          optionIdPrefix
        )}
        className={clsx(styles.panel, className)}
        style={{ ...style, left: position?.left, top: position?.top }}
      >
        {options.map((option, index) => {
          const optionId =
            option.id ?? getListboxOptionId(optionIdPrefix, option.value);
          const isActive = index === activeIndex;
          const isDisabled = option.disabled === true;

          const handlePointerDown = (event: ReactPointerEvent): void => {
            event.preventDefault();

            pointerSelectedValueRef.current = isDisabled ? null : option.value;

            if (!isDisabled) {
              onOptionSelect(option);
            }
          };

          // Pointerdown already selected; the click that follows must not select again.
          const handleClick = (): void => {
            if (pointerSelectedValueRef.current === option.value) {
              pointerSelectedValueRef.current = null;
              return;
            }

            onOptionSelect(option);
          };

          const handleMouseEnter = (): void => {
            if (!isDisabled && !isActive) {
              onActiveIndexChange?.(index);
            }
          };

          return (
            <button
              key={option.value}
              ref={isActive ? activeOptionRef : undefined}
              type="button"
              id={optionId}
              role="option"
              aria-selected={option.selected ?? false}
              aria-disabled={option.disabled === true ? true : undefined}
              disabled={option.disabled === true}
              className={clsx(
                styles.option,
                isActive && styles.optionActive,
                option.divider === true && styles.optionDivider
              )}
              onPointerDown={handlePointerDown}
              onClick={handleClick}
              onMouseEnter={handleMouseEnter}
            >
              {isPresentNode(option.leftIcon) ? (
                <span className={styles.optionIcon}>{option.leftIcon}</span>
              ) : null}
              <span className={styles.optionContent}>
                <span className={styles.optionLabel}>{option.label}</span>
                {isPresentNode(option.subtitle) ? (
                  <span className={styles.optionSubtitle}>
                    {option.subtitle}
                  </span>
                ) : null}
              </span>
              {isPresentNode(option.support) ? (
                <span className={styles.optionSupport}>{option.support}</span>
              ) : null}
              {isPresentNode(option.rightIcon) ? (
                <span className={styles.optionIcon}>{option.rightIcon}</span>
              ) : null}
              {option.checked === true ? (
                <Check aria-hidden="true" className={styles.check} />
              ) : null}
            </button>
          );
        })}
        {options.length === 0 ? emptyContent : null}
      </div>
    </Activity>
  );
};
