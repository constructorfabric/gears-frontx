/**
 * Skeleton Component - Based on shadcn/ui skeleton
 */

import { cn } from "@/app/lib/utils"

function Skeleton({
  className,
  inheritColor = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inheritColor?: boolean }) {
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
