import {
  Field as UiField,
  FieldDescription as UiFieldDescription,
  FieldGroup as UiFieldGroup,
  FieldLabel as UiFieldLabel,
  FieldLegend as UiFieldLegend,
  FieldSet as UiFieldSet,
} from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import type { HTMLAttributes, LabelHTMLAttributes, Ref } from "react";

import { hasRenderableContent } from "../react-node-text";

import styles from "./field.module.css";

type FieldOrientation = "vertical" | "horizontal" | "responsive";

interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  readonly orientation?: FieldOrientation;
  readonly ref?: Ref<HTMLDivElement>;
}

interface FieldLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly required?: boolean;
  readonly ref?: Ref<HTMLLabelElement>;
}

interface FieldErrorProps extends HTMLAttributes<HTMLParagraphElement> {
  readonly ref?: Ref<HTMLParagraphElement>;
}

interface FieldDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  readonly ref?: Ref<HTMLParagraphElement>;
}

type FieldGroupProps = HTMLAttributes<HTMLDivElement>;

type FieldSetProps = HTMLAttributes<HTMLFieldSetElement>;

type FieldLegendProps = HTMLAttributes<HTMLLegendElement>;

export const Field = ({
  orientation = "vertical",
  className,
  ref,
  ...props
}: FieldProps) => (
  <UiField
    {...props}
    ref={ref}
    role="group"
    orientation={orientation}
    className={clsx(
      styles.field,
      orientation === "horizontal" && styles.horizontal,
      orientation === "responsive" && styles.responsive,
      className
    )}
  />
);

export const FieldLabel = ({
  className,
  required = false,
  ref,
  children,
  ...props
}: FieldLabelProps) => (
  <UiFieldLabel {...props} ref={ref} className={clsx(styles.label, className)}>
    {children}
    {required ? (
      <span aria-hidden="true" className={styles.required}>
        *
      </span>
    ) : null}
  </UiFieldLabel>
);

export const FieldError = ({
  className,
  children,
  role,
  ref,
  ...props
}: FieldErrorProps) => {
  if (!hasRenderableContent(children)) {
    return null;
  }

  return (
    <p
      {...props}
      ref={ref}
      role={role ?? "alert"}
      className={clsx(styles.error, className)}
    >
      {children}
    </p>
  );
};

export const FieldDescription = ({
  className,
  ref,
  ...props
}: FieldDescriptionProps) => (
  <UiFieldDescription
    {...props}
    ref={ref}
    className={clsx(styles.description, className)}
  />
);

export const FieldGroup = ({ className, ...props }: FieldGroupProps) => (
  <UiFieldGroup {...props} className={clsx(styles.group, className)} />
);

export const FieldSet = ({ className, ...props }: FieldSetProps) => (
  <UiFieldSet {...props} className={clsx(styles.fieldSet, className)} />
);

export const FieldLegend = ({ className, ...props }: FieldLegendProps) => (
  <UiFieldLegend {...props} className={clsx(styles.legend, className)} />
);
