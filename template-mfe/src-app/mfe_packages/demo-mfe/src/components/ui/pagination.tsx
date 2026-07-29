import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "../../lib/utils"
import { buttonVariants } from "./button"
import { ButtonVariant, ButtonSize } from "../types"
import { ChevronLeftIcon } from "../icons/ChevronLeftIcon"
import { ChevronRightIcon } from "../icons/ChevronRightIcon"
import { MoreHorizontalIcon } from "../icons/MoreHorizontalIcon"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
  size?: ButtonSize
  asChild?: boolean
} & React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = ButtonSize.Icon,
  asChild,
  ...props
}: PaginationLinkProps) {
  const Comp = asChild ? Slot : "a"
  return (
    <Comp
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? ButtonVariant.Outline : ButtonVariant.Ghost,
          size,
        }),
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  children,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size={ButtonSize.Default}
      className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon className="h-4 w-4" />
      <span className="hidden sm:block">{children ?? "Previous"}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  children,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size={ButtonSize.Default}
      className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
      {...props}
    >
      <span className="hidden sm:block">{children ?? "Next"}</span>
      <ChevronRightIcon className="h-4 w-4" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="h-4 w-4" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
