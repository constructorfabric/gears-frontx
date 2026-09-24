import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

import styles from "./separator.module.css";

interface SeparatorProps extends Omit<HTMLAttributes<HTMLHRElement>, "color"> {
  readonly orientation?: "horizontal" | "vertical";
  readonly decorative?: boolean;
}

export const Separator = ({
  orientation = "horizontal",
  decorative = false,
  className,
  ...props
}: SeparatorProps) => (
  <hr
    {...props}
    aria-hidden={decorative ? "true" : props["aria-hidden"]}
    aria-orientation={decorative ? undefined : orientation}
    className={clsx(
      styles.separator,
      orientation === "horizontal" ? styles.horizontal : styles.vertical,
      className
    )}
    role={decorative ? undefined : "separator"}
  />
);

Separator.displayName = "Separator";
