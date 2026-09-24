import { clsx } from "clsx";
import type { HTMLAttributes, Ref } from "react";

import styles from "./scroll-region.module.css";

interface ScrollRegionProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "ref"
> {
  readonly ref?: Ref<HTMLDivElement>;
}

export const ScrollRegion = ({
  className,
  ref,
  ...props
}: ScrollRegionProps) => (
  <div ref={ref} className={clsx(styles.scrollRegion, className)} {...props} />
);

ScrollRegion.displayName = "ScrollRegion";
