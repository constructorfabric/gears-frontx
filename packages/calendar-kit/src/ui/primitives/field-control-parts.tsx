import { clsx } from "clsx";
import type { ReactNode } from "react";

interface FieldControlLabelProps {
  readonly controlId: string;
  readonly label: ReactNode;
  readonly labelId: string;
  readonly required: boolean;
  readonly className: string;
  readonly requiredClassName: string;
}

export const FieldControlLabel = ({
  controlId,
  label,
  labelId,
  required,
  className,
  requiredClassName,
}: FieldControlLabelProps) => (
  <label id={labelId} htmlFor={controlId} className={className}>
    {label}
    {required ? (
      <span aria-hidden="true" className={requiredClassName}>
        *
      </span>
    ) : null}
  </label>
);

interface FieldControlMessageProps {
  readonly invalid: boolean;
  readonly message: ReactNode;
  readonly messageId: string;
  readonly className: string;
  readonly invalidClassName: string;
}

export const FieldControlMessage = ({
  invalid,
  message,
  messageId,
  className,
  invalidClassName,
}: FieldControlMessageProps) => (
  <p
    id={messageId}
    role={invalid ? "alert" : undefined}
    className={clsx(className, invalid && invalidClassName)}
  >
    {message}
  </p>
);
