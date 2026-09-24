import { Checkbox as UiCheckbox } from "@gears-frontx/ui-kit";
import type { CheckboxProps as UiCheckboxProps } from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import type { ChangeEventHandler, InputHTMLAttributes, Ref } from "react";

import { isInputChangeEvent } from "../input-event";

import styles from "./checkbox.module.css";

interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "ref" | "type" | "onChange"
> {
  readonly ref?: Ref<HTMLInputElement>;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
}

// ui-kit types its handler props against the root element, so rest props pass through a guard.
const isUiCheckboxProps = (value: unknown): value is UiCheckboxProps =>
  typeof value === "object" && value !== null;

export const Checkbox = ({
  className,
  ref,
  onChange,
  value,
  ...props
}: CheckboxProps) => {
  const forwardedProps = isUiCheckboxProps(props) ? props : {};

  const resolvedValue = value ?? undefined;

  return (
    <UiCheckbox
      {...forwardedProps}
      value={resolvedValue === undefined ? undefined : String(resolvedValue)}
      className={clsx(styles.checkbox, className)}
      inputRef={ref}
      onCheckedChange={
        onChange === undefined
          ? undefined
          : (_checked, details) => {
              if (isInputChangeEvent(details.event)) {
                onChange(details.event);
              }
            }
      }
    />
  );
};

Checkbox.displayName = "Checkbox";
