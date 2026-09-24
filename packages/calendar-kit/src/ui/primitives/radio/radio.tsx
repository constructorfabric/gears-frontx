import {
  RadioGroup as UiRadioGroup,
  RadioGroupItem as UiRadioGroupItem,
} from "@gears-frontx/ui-kit";
import type { RadioGroupItemProps as UiRadioGroupItemProps } from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import {
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
} from "react";
import type {
  ChangeEventHandler,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  KeyboardEventHandler,
  ReactElement,
  ReactNode,
  Ref,
} from "react";

import { resolveDirection } from "../direction";
import { isInputChangeEvent } from "../input-event";
import { assignRef } from "../listbox-internals-utils";
import { flattenNodeList, textFromNode } from "../react-node-text";

import styles from "./radio.module.css";

type RadioType = "box-only" | "box-first" | "text-first";

type RadioGroupOrientation = "vertical" | "horizontal";

type AriaInvalid = InputHTMLAttributes<HTMLInputElement>["aria-invalid"];

type RadioInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | "checked"
  | "className"
  | "disabled"
  | "name"
  | "onChange"
  | "onKeyDown"
  | "required"
  | "type"
  | "value"
>;

interface RadioProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | "checked"
  | "className"
  | "disabled"
  | "name"
  | "onChange"
  | "onKeyDown"
  | "required"
  | "type"
  | "value"
> {
  readonly type?: RadioType;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly label?: ReactNode;
  readonly message?: ReactNode;
  readonly invalid?: boolean;
  readonly value: string;
  readonly name?: string;
  readonly className?: string;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
  readonly onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  readonly ref?: Ref<HTMLInputElement>;
}

interface RadioGroupProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-label" | "aria-orientation" | "children" | "role"
> {
  readonly children?: ReactNode;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly name: string;
  readonly orientation?: RadioGroupOrientation;
  readonly invalid?: boolean;
  readonly "aria-label"?: string;
}

interface RadioGroupContextValue {
  readonly focusableValue: string | undefined;
  readonly consumeFocusSuppression: () => boolean;
}

const InRadioGroup = createContext<RadioGroupContextValue | null>(null);

interface InputListener {
  readonly node: HTMLInputElement;
  readonly handler: EventListener;
}

const isInputKeyEvent = (
  value: unknown
): value is KeyboardEvent<HTMLInputElement> =>
  typeof value === "object" && value !== null && "key" in value;

const useNativeChangeBridge = (
  ref: Ref<HTMLInputElement> | undefined,
  onChange: ChangeEventHandler<HTMLInputElement> | undefined
): ((node: HTMLInputElement | null) => void) => {
  const listenerRef = useRef<InputListener | null>(null);

  return useCallback(
    (node: HTMLInputElement | null) => {
      const previous = listenerRef.current;

      if (previous) {
        previous.node.removeEventListener("change", previous.handler);
        listenerRef.current = null;
      }

      assignRef(ref, node);

      if (!node || !onChange) {
        return;
      }

      const handler: EventListener = (event) => {
        if (isInputChangeEvent(event)) {
          onChange(event);
        }
      };
      node.addEventListener("change", handler);
      listenerRef.current = { handler, node };
    },
    [onChange, ref]
  );
};

const isGroupRootProps = (
  props: RadioInputProps
): props is RadioInputProps & UiRadioGroupItemProps =>
  typeof props === "object";

interface StandaloneRadioControlProps {
  readonly ariaInvalid: AriaInvalid;
  readonly ariaLabel: string | undefined;
  readonly ariaLabelledBy: string | undefined;
  readonly checked: boolean | undefined;
  readonly defaultChecked: boolean | undefined;
  readonly defaultValue: string | number | readonly string[] | undefined;
  readonly describedBy: string | undefined;
  readonly disabled: boolean;
  readonly inputId: string;
  readonly inputProps: RadioInputProps;
  readonly inputRef: Ref<HTMLInputElement> | undefined;
  readonly invalid: boolean;
  readonly name: string | undefined;
  readonly onChange: ChangeEventHandler<HTMLInputElement> | undefined;
  readonly onKeyDown: KeyboardEventHandler<HTMLInputElement> | undefined;
  readonly required: boolean;
  readonly value: string;
}

const StandaloneRadioControl = ({
  ariaInvalid,
  ariaLabel,
  ariaLabelledBy,
  checked,
  defaultChecked,
  defaultValue,
  describedBy,
  disabled,
  inputId,
  inputProps,
  inputRef,
  invalid,
  name,
  onChange,
  onKeyDown,
  required,
  value,
}: StandaloneRadioControlProps) => {
  const nativeProps: InputHTMLAttributes<HTMLInputElement> = {
    ...inputProps,
    ...(checked === undefined ? { defaultChecked, defaultValue } : { checked }),
    "aria-describedby": describedBy,
    "aria-invalid": invalid ? "true" : ariaInvalid,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    disabled,
    id: inputId,
    name,
    onChange,
    onKeyDown,
    required,
    type: "radio",
    value,
  };

  return <input {...nativeProps} className={styles.input} ref={inputRef} />;
};

interface GroupedRadioControlProps {
  readonly ariaInvalid: AriaInvalid;
  readonly ariaLabel: string | undefined;
  readonly ariaLabelledBy: string | undefined;
  readonly describedBy: string | undefined;
  readonly disabled: boolean;
  readonly group: RadioGroupContextValue | null;
  readonly inputId: string;
  readonly inputProps: RadioInputProps;
  readonly inputRef: Ref<HTMLInputElement> | undefined;
  readonly invalid: boolean;
  readonly label: ReactNode;
  readonly labelText: string;
  readonly onChange: ChangeEventHandler<HTMLInputElement> | undefined;
  readonly onKeyDown: KeyboardEventHandler<HTMLInputElement> | undefined;
  readonly required: boolean;
  readonly showText: boolean;
  readonly value: string;
}

const GroupedRadioControl = ({
  ariaInvalid,
  ariaLabel,
  ariaLabelledBy,
  describedBy,
  disabled,
  group,
  inputId,
  inputProps,
  inputRef,
  invalid,
  label,
  labelText,
  onChange,
  onKeyDown,
  required,
  showText,
  value,
}: GroupedRadioControlProps) => {
  const groupedInputRef = useNativeChangeBridge(inputRef, onChange);
  const inGroup = group !== null;
  const labelledLabel =
    ariaLabel ??
    (!showText && (label ?? null) !== null ? labelText : undefined);

  const groupProps = isGroupRootProps(inputProps) ? inputProps : undefined;

  return (
    <UiRadioGroupItem
      {...groupProps}
      inputRef={groupedInputRef}
      id={inputId}
      value={value}
      disabled={disabled}
      required={required}
      aria-invalid={invalid ? "true" : ariaInvalid}
      aria-describedby={describedBy}
      aria-label={labelledLabel}
      aria-labelledby={ariaLabelledBy}
      data-calendar-radio-value={value}
      tabIndex={inGroup && group.focusableValue === value ? 0 : -1}
      onFocusCapture={
        inGroup
          ? (event) => {
              if (!group.consumeFocusSuppression()) {
                return;
              }

              event.preventDefault();
            }
          : undefined
      }
      onKeyDown={
        onKeyDown === undefined
          ? undefined
          : (event) => {
              if (isInputKeyEvent(event)) {
                onKeyDown(event);
              }
            }
      }
    />
  );
};

interface LabeledRadioProps {
  readonly children: ReactNode;
  readonly className: string | undefined;
  readonly disabled: boolean;
  readonly inputId: string;
  readonly label: ReactNode;
  readonly message: ReactNode;
  readonly required: boolean;
  readonly textFirst: boolean;
}

const LabeledRadio = ({
  children,
  className,
  disabled,
  inputId,
  label,
  message,
  required,
  textFirst,
}: LabeledRadioProps) => (
  <span className={styles.field}>
    <label
      htmlFor={inputId}
      className={clsx(
        styles.row,
        disabled ? styles.cursorNotAllowed : styles.cursorPointer,
        className
      )}
    >
      {textFirst ? (
        <>
          <span className={styles.text}>
            {((label ?? null) !== null || required) && (
              <span
                className={clsx(styles.label, disabled && styles.labelDisabled)}
              >
                {label}
                {required ? (
                  <span aria-hidden="true" className={styles.requiredMark}>
                    *
                  </span>
                ) : null}
              </span>
            )}
          </span>
          {children}
        </>
      ) : (
        <>
          {children}
          <span className={styles.text}>
            {((label ?? null) !== null || required) && (
              <span
                className={clsx(styles.label, disabled && styles.labelDisabled)}
              >
                {label}
                {required ? (
                  <span aria-hidden="true" className={styles.requiredMark}>
                    *
                  </span>
                ) : null}
              </span>
            )}
          </span>
        </>
      )}
    </label>
    {message}
  </span>
);

const Radio = ({
  type: layout = "box-first",
  checked,
  disabled = false,
  required = false,
  label,
  message,
  invalid = false,
  value,
  name,
  className,
  onChange,
  onKeyDown,
  ref,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  defaultChecked,
  defaultValue,
  ...inputProps
}: RadioProps) => {
  const group = useContext(InRadioGroup);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const hasMessage = (message ?? null) !== null;
  const showText = layout !== "box-only";
  const labelText = textFromNode(label);
  const describedBy =
    [ariaDescribedBy, showText && hasMessage ? messageId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  const control =
    group === null ? (
      <StandaloneRadioControl
        ariaInvalid={ariaInvalid}
        ariaLabel={ariaLabel}
        ariaLabelledBy={ariaLabelledBy}
        checked={checked}
        defaultChecked={defaultChecked}
        defaultValue={defaultValue}
        describedBy={describedBy}
        disabled={disabled}
        inputId={inputId}
        inputProps={inputProps}
        inputRef={ref}
        invalid={invalid}
        name={name}
        onChange={onChange}
        onKeyDown={onKeyDown}
        required={required}
        value={value}
      />
    ) : (
      <GroupedRadioControl
        ariaInvalid={ariaInvalid}
        ariaLabel={ariaLabel}
        ariaLabelledBy={ariaLabelledBy}
        describedBy={describedBy}
        disabled={disabled}
        group={group}
        inputId={inputId}
        inputProps={inputProps}
        inputRef={ref}
        invalid={invalid}
        label={label}
        labelText={labelText}
        onChange={onChange}
        onKeyDown={onKeyDown}
        required={required}
        showText={showText}
        value={value}
      />
    );

  if (layout === "box-only") {
    return (
      <span
        className={clsx(
          styles.box,
          disabled && styles.cursorNotAllowed,
          className
        )}
      >
        {control}
      </span>
    );
  }

  return (
    <LabeledRadio
      className={className}
      disabled={disabled}
      inputId={inputId}
      label={label}
      message={
        hasMessage ? (
          <span
            id={messageId}
            className={clsx(styles.message, invalid && styles.messageInvalid)}
          >
            {message}
          </span>
        ) : null
      }
      required={required}
      textFirst={layout === "text-first"}
    >
      {control}
    </LabeledRadio>
  );
};

const isRadioElement = (node: ReactNode): node is ReactElement<RadioProps> =>
  isValidElement(node) && node.type === Radio;

const isFragmentElement = (
  node: ReactNode
): node is ReactElement<{ readonly children?: ReactNode }> =>
  isValidElement(node) && node.type === Fragment;

const collectRadioOptions = (
  children: ReactNode
): { value: string; disabled?: boolean }[] => {
  const options: { value: string; disabled?: boolean }[] = [];

  for (const child of flattenNodeList(children)) {
    if (isRadioElement(child)) {
      options.push({
        disabled: child.props.disabled,
        value: child.props.value,
      });
      continue;
    }

    if (isFragmentElement(child)) {
      options.push(...collectRadioOptions(child.props.children));
    }
  }

  return options;
};

const RTL_PREVIOUS_KEY = "ArrowRight";
const RTL_NEXT_KEY = "ArrowLeft";

/** Base UI cannot see the direction of a shadow host, so RTL arrows bridge here. */
const rtlStepFor = (key: string): -1 | 0 | 1 => {
  if (key === "ArrowUp" || key === RTL_PREVIOUS_KEY) {
    return -1;
  }

  if (key === "ArrowDown" || key === RTL_NEXT_KEY) {
    return 1;
  }

  return 0;
};

const RadioGroup = ({
  children,
  value,
  onValueChange,
  name,
  orientation = "vertical",
  invalid = false,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  ...groupProps
}: RadioGroupProps) => {
  const options = collectRadioOptions(children);
  const firstEnabledValue = options.find(
    (option) => option.disabled !== true
  )?.value;
  let hasSelectedEnabledValue = false;

  const enabledValues: string[] = [];

  for (const option of options) {
    if (option.disabled === true) {
      continue;
    }

    enabledValues.push(option.value);

    if (option.value === value) {
      hasSelectedEnabledValue = true;
    }
  }

  const resolvedValue = hasSelectedEnabledValue
    ? value
    : (firstEnabledValue ?? value);

  const suppressFocusRef = useRef(false);

  const consumeFocusSuppression = useCallback(() => {
    const suppressed = suppressFocusRef.current;
    suppressFocusRef.current = false;

    return suppressed;
  }, []);

  const handleKeyDownCapture: KeyboardEventHandler<HTMLDivElement> = (
    event
  ) => {
    groupProps.onKeyDownCapture?.(event);

    if (event.defaultPrevented || enabledValues.length === 0) {
      return;
    }

    const eventPath = event.nativeEvent.composedPath();
    const radio = eventPath.find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.getAttribute("role") === "radio"
    );
    const currentValue = radio?.dataset.calendarRadioValue;

    if (currentValue === undefined) {
      return;
    }

    const currentIndex = enabledValues.indexOf(currentValue);

    if (currentIndex === -1) {
      return;
    }

    const direction = resolveDirection(event.currentTarget);

    if (direction !== "rtl") {
      return;
    }

    const step = rtlStepFor(event.key);

    if (step === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextValue =
      enabledValues[
        (currentIndex + step + enabledValues.length) % enabledValues.length
      ];

    onValueChange(nextValue);
    suppressFocusRef.current = true;
    const nextRadio = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
    ].find((candidate) => candidate.dataset.calendarRadioValue === nextValue);
    nextRadio?.focus();
  };

  const contextValue = useMemo(
    () => ({ consumeFocusSuppression, focusableValue: resolvedValue }),
    [consumeFocusSuppression, resolvedValue]
  );

  return (
    <InRadioGroup.Provider value={contextValue}>
      <UiRadioGroup
        {...groupProps}
        name={name}
        value={resolvedValue}
        onValueChange={(nextValue) => {
          onValueChange(String(nextValue));
        }}
        onKeyDownCapture={handleKeyDownCapture}
        aria-label={ariaLabel}
        aria-orientation={orientation}
        aria-invalid={invalid ? "true" : ariaInvalid}
        className={clsx(
          styles.group,
          orientation === "horizontal" ? styles.groupRow : styles.groupColumn,
          className
        )}
      >
        {children}
      </UiRadioGroup>
    </InRadioGroup.Provider>
  );
};

Radio.displayName = "Radio";
RadioGroup.displayName = "RadioGroup";

export { Radio, RadioGroup };
