import { cn } from "../../lib/utils"

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * If true, skeleton inherits text color instead of using bg-muted
   * Useful for buttons, menu items, and colored text
   */
  inheritColor?: boolean;
}

function Skeleton({
  className,
  inheritColor = false,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md",
        inheritColor ? "bg-current opacity-20" : "bg-muted",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
