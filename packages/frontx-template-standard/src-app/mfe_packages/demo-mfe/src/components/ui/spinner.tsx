import * as React from "react"
import { Loader2 } from "lucide-react"
import trim from "lodash/trim"

import { cn } from "../../lib/utils"

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ComponentType<{ className?: string }>
  size?: string
}

const Spinner = (
  {
    ref,
    className,
    icon: Icon = Loader2,
    size = "size-4",
    ...props
  }: SpinnerProps & {
    ref?: React.Ref<HTMLDivElement>;
  }
) => {
  // Extract text-* color classes for the icon, keep other classes for wrapper
  const textColorClasses = className?.match(/\btext-\S+/g)?.join(' ') || '';
  const wrapperClasses = trim(className?.replace(/\btext-\S+/g, '') || '');

  return (
    <div
      ref={ref}
      className={cn("inline-flex items-center justify-center", wrapperClasses)}
      {...props}
    >
      <Icon className={cn("animate-spin", size, textColorClasses)} />
    </div>
  )
}
Spinner.displayName = "Spinner"

export { Spinner }
