import { clsx } from "clsx";
import type { HTMLAttributes, Ref } from "react";

import styles from "./empty.module.css";

interface EmptyProps extends Omit<HTMLAttributes<HTMLDivElement>, "ref"> {
  readonly ref?: Ref<HTMLDivElement>;
}

export const Empty = ({ className, ref, ...props }: EmptyProps) => (
  <div
    ref={ref}
    role="status"
    className={clsx(styles.empty, className)}
    {...props}
  />
);

Empty.displayName = "Empty";
