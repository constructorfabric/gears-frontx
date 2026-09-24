import { Textarea as UiTextarea } from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import type { ReactNode, Ref, TextareaHTMLAttributes } from "react";

import { FieldControlLabel, FieldControlMessage } from "../field-control-parts";
import { useFieldControlIds } from "../use-field-control-ids";

import styles from "./textarea.module.css";

const DEFAULT_ROWS = 3;

interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "readOnly"
> {
  readonly invalid?: boolean;
  readonly readOnly?: boolean;
  readonly label?: ReactNode;
  readonly message?: ReactNode;
  readonly required?: boolean;
  readonly ref?: Ref<HTMLTextAreaElement>;
}

const Textarea = ({
  ref,
  id,
  className,
  invalid = false,
  readOnly = false,
  label,
  message,
  required = false,
  rows = DEFAULT_ROWS,
  disabled,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  style,
  ...props
}: TextareaProps) => {
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

      <label
        htmlFor={controlId}
        className={clsx(
          styles.shell,
          invalid && styles.shellInvalid,
          readOnly && styles.shellReadOnly,
          className
        )}
      >
        <UiTextarea
          {...props}
          ref={ref}
          id={controlId}
          className={clsx(styles.control, className)}
          rows={rows}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={invalid ? "true" : ariaInvalid}
          aria-describedby={describedBy || undefined}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          style={style}
        />
      </label>

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

Textarea.displayName = "Textarea";

export { Textarea };
