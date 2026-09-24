import { clsx } from "clsx";
import type { HTMLAttributes, Ref } from "react";

import styles from "./skeleton.module.css";

interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, "ref"> {
  readonly inheritColor?: boolean;
  readonly ref?: Ref<HTMLDivElement>;
}

export const Skeleton = ({
  className,
  inheritColor = false,
  ref,
  ...props
}: SkeletonProps) => (
  <div
    ref={ref}
    aria-hidden="true"
    className={clsx(
      styles.skeleton,
      inheritColor && styles.inheritColor,
      className
    )}
    {...props}
  />
);

Skeleton.displayName = "Skeleton";
