import { cn } from "../../lib/utils"

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  inheritColor?: boolean;
}

function Skeleton({ className, inheritColor = false, ...props }: SkeletonProps) {
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
