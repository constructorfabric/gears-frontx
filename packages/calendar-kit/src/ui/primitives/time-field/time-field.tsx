import { Activity, useCallback, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";

import type { LocalTime } from "../../../core/model";
import {
  TIME_INPUT,
  formatTimeOfDay,
  minutesFromLocalTime,
  parseTimeInput,
} from "../../../core/time-input";
import { Input } from "../input/input";
import { Listbox } from "../listbox-internals";
import type { ListboxOption } from "../listbox-internals";
import { useListboxController } from "../listbox-internals-controller";
import { assignRef } from "../listbox-internals-utils";

import styles from "./time-field.module.css";

const nearestOptionIndex = (
  options: readonly LocalTime[],
  value: LocalTime | ""
): number | undefined => {
  if (value === "" || options.length === 0) {
    return undefined;
  }

  const exact = options.indexOf(value);

  if (exact !== -1) {
    return exact;
  }

  const target = minutesFromLocalTime(value);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [index, option] of options.entries()) {
    const distance = Math.abs(minutesFromLocalTime(option) - target);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
};

interface TimeFieldProps {
  readonly value: LocalTime | "";
  readonly options: readonly LocalTime[];
  readonly locale: string;
  readonly onValueChange: (value: LocalTime) => void;
  readonly id?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly invalid?: boolean;
  readonly iconLeft?: ReactNode;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
  readonly ref?: Ref<HTMLInputElement>;
}

export const TimeField = ({
  ref,
  value,
  options,
  locale,
  onValueChange,
  id,
  placeholder,
  disabled = false,
  readOnly = false,
  invalid = false,
  iconLeft,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: TimeFieldProps) => {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listboxId = `${controlId}-listbox`;
  const optionIdPrefix = `${controlId}-option`;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const setInputRef = useCallback(
    (node: HTMLInputElement | null): void => {
      inputRef.current = node;
      assignRef(ref, node);
    },
    [ref]
  );

  const [draft, setDraft] = useState<string | null>(null);

  const [draftRejected, setDraftRejected] = useState(false);

  const locked = disabled || readOnly;

  const listboxOptions = useMemo<readonly ListboxOption<LocalTime>[]>(
    () =>
      options.map((option) => ({
        checked: option === value,
        label: formatTimeOfDay(option, locale),
        selected: option === value,
        value: option,
      })),
    [locale, options, value]
  );

  const activeOptionIndex = useMemo(
    () => nearestOptionIndex(options, value),
    [options, value]
  );

  const displayedText =
    draft ?? (value === "" ? "" : formatTimeOfDay(value, locale));

  const commitText = useCallback(
    (text: string): boolean => {
      const result = parseTimeInput(text, {
        locale,
        reference: value === "" ? undefined : value,
      });

      if (result.kind === TIME_INPUT.invalid) {
        setDraftRejected(true);

        return false;
      }

      setDraft(null);
      setDraftRejected(false);

      if (result.kind === TIME_INPUT.value) {
        onValueChange(result.value);
      }

      return true;
    },
    [locale, onValueChange, value]
  );

  const controller = useListboxController<LocalTime>({
    anchorRef: rootRef,
    disabled: locked,
    focusTrigger: () => {
      inputRef.current?.focus();
    },
    onSelect: (option) => {
      setDraft(null);
      setDraftRejected(false);
      onValueChange(option.value);
    },
    options: listboxOptions,
    panelRef: listboxRef,
    // Space separates `9 30` and `9 pm`, so it must reach the input.
    selectOnSpace: false,
    selectedIndex: activeOptionIndex,
  });

  const changeDraft = useCallback(
    (text: string) => {
      if (locked) {
        return;
      }

      setDraft(text);
      setDraftRejected(false);

      if (!controller.open) {
        controller.openListbox();
      }
    },
    [controller, locked]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && draft !== null) {
        setDraft(null);
        setDraftRejected(false);
      }

      if (event.key === "Enter" && draft !== null) {
        event.preventDefault();

        if (commitText(draft)) {
          controller.closeListbox();
        }
        return;
      }

      if (event.key === "Tab" && draft !== null) {
        commitText(draft);
      }

      controller.handleKeyDown(event);
    },
    [commitText, controller, draft]
  );

  const handleBlur = useCallback(() => {
    if (draft !== null) {
      commitText(draft);
    }
  }, [commitText, draft]);

  const { activeOption } = controller;

  const activeOptionId =
    controller.open && activeOption !== undefined
      ? `${optionIdPrefix}-${activeOption.value}`
      : undefined;

  return (
    <div ref={rootRef} className={styles.root}>
      <Input
        ref={setInputRef}
        id={controlId}
        role="combobox"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || draftRejected}
        iconLeft={iconLeft}
        value={displayedText}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="listbox"
        aria-autocomplete="none"
        aria-expanded={controller.open}
        aria-controls={controller.open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        onChange={(event) => {
          changeDraft(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onClick={() => {
          if (!locked && !controller.open) {
            controller.openListbox();
          }
        }}
      />

      <Activity mode={controller.open ? "visible" : "hidden"}>
        <Listbox
          ref={listboxRef}
          anchorRef={rootRef}
          id={listboxId}
          open={controller.open}
          activeIndex={controller.activeIndex}
          options={listboxOptions}
          optionIdPrefix={optionIdPrefix}
          onActiveIndexChange={(index) => {
            controller.setActiveIndex(index);
          }}
          onOptionSelect={(option) => {
            controller.selectOption(option);
          }}
          scrollActiveOptionIntoView
        />
      </Activity>
    </div>
  );
};

TimeField.displayName = "TimeField";
