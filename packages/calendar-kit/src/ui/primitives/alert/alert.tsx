import { clsx } from "clsx";
import type { HTMLAttributes, Ref } from "react";

import styles from "./alert.module.css";

type AlertVariant = "default" | "destructive";

interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "ref"> {
  readonly variant?: AlertVariant;
  readonly ref?: Ref<HTMLDivElement>;
}

export const Alert = ({
  className,
  ref,
  variant = "default",
  ...props
}: AlertProps) => (
  <div
    ref={ref}
    role="alert"
    className={clsx(
      styles.alert,
      variant === "destructive" ? styles.destructive : styles.default,
      className
    )}
    {...props}
  />
);

Alert.displayName = "Alert";
