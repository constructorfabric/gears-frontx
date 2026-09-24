import { Input as UiInput } from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { FieldControlLabel, FieldControlMessage } from "../field-control-parts";
import { flattenNodeList, isPresentNode } from "../react-node-text";
import { useFieldControlIds } from "../use-field-control-ids";

import styles from "./input.module.css";

type InputSize = "xxl" | "xl" | "l" | "m" | "s";

const SIZE_CLASS: Readonly<Record<InputSize, string>> = {
  l: styles.sizeL,
  m: styles.sizeM,
  s: styles.sizeS,
  xl: styles.sizeXl,
  xxl: styles.sizeXxl,
};

interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "prefix" | "readOnly" | "size"
> {
  readonly size?: InputSize;
  readonly invalid?: boolean;
  readonly readOnly?: boolean;
  readonly label?: ReactNode;
  readonly message?: ReactNode;
  readonly required?: boolean;
  readonly iconLeft?: ReactNode;
  readonly prefix?: ReactNode;
  readonly suffix?: ReactNode;
  readonly action?: ReactNode;
  readonly leadingAction?: ReactNode;
  readonly onValueChange?: (value: string) => void;
  readonly ref?: Ref<HTMLInputElement>;
}

const controlClassName = ({
  className,
  hasIcon,
}: {
  readonly className?: string;
  readonly hasIcon: boolean;
}): string =>
  clsx(styles.control, hasIcon && styles.controlWithIcon, className);

const shellClassName = ({
  className,
  hasIcon,
  invalid,
  readOnly,
  size,
}: {
  readonly className?: string;
  readonly hasIcon: boolean;
  readonly invalid: boolean;
  readonly readOnly: boolean;
  readonly size: InputSize;
}): string =>
  clsx(
    styles.shell,
    SIZE_CLASS[size],
    hasIcon && styles.shellWithIcon,
    invalid && styles.shellInvalid,
    readOnly && styles.shellReadOnly,
    className
  );

interface AffixedControlProps {
  readonly control: ReactNode;
  readonly controlId: string;
  readonly prefix: ReactNode;
  readonly suffix: ReactNode;
}

// Always a label: swapping the wrapper remounts the control and drops the caret.
const AffixedControl = ({
  control,
  controlId,
  prefix,
  suffix,
}: AffixedControlProps) => (
  <label htmlFor={controlId} className={styles.controlLabel}>
    {isPresentNode(prefix) ? (
      <span className={styles.affix}>{prefix}</span>
    ) : null}
    {control}
    {isPresentNode(suffix) ? (
      <span className={styles.affix}>{suffix}</span>
    ) : null}
  </label>
);

const Input = ({
  ref,
  id,
  className,
  size = "l",
  invalid = false,
  readOnly = false,
  label,
  message,
  required = false,
  iconLeft,
  prefix,
  suffix,
  action,
  leadingAction,
  onValueChange,
  onChange,
  type,
  disabled,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: InputProps) => {
  const {
    controlId,
    describedBy,
    hasLabel,
    hasMessage,
    labelId,
    labelledBy,
    messageId,
  } = useFieldControlIds({
    ariaDescribedBy,
    ariaLabel,
    ariaLabelledBy,
    id,
    label,
    message,
  });

  const hasIcon = flattenNodeList(iconLeft).some((child) => child !== "");
  const hasAction = isPresentNode(action);
  const hasLeadingAction = isPresentNode(leadingAction);

  const control = (
    <UiInput
      {...props}
      ref={ref}
      id={controlId}
      className={controlClassName({ className, hasIcon })}
      icon={
        hasIcon ? <span className={styles.icon}>{iconLeft}</span> : undefined
      }
      type={type}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      aria-invalid={invalid ? "true" : ariaInvalid}
      aria-describedby={describedBy || undefined}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      onChange={onChange}
      onValueChange={(value) => onValueChange?.(value)}
    />
  );

  return (
    <div className={styles.field}>
      {hasLabel ? (
        <FieldControlLabel
          controlId={controlId}
          label={label}
          labelId={labelId}
          required={required}
          className={styles.topLabel}
          requiredClassName={styles.required}
        />
      ) : null}

      <div
        className={shellClassName({
          className,
          hasIcon,
          invalid,
          readOnly,
          size,
        })}
      >
        {hasLeadingAction ? (
          <span className={styles.action}>{leadingAction}</span>
        ) : null}

        <AffixedControl
          control={control}
          controlId={controlId}
          prefix={prefix}
          suffix={suffix}
        />

        {hasAction ? <span className={styles.action}>{action}</span> : null}
      </div>

      {hasMessage ? (
        <FieldControlMessage
          invalid={invalid}
          message={message}
          messageId={messageId}
          className={styles.message}
          invalidClassName={styles.messageInvalid}
        />
      ) : null}
    </div>
  );
};

Input.displayName = "Input";

export { Input };
