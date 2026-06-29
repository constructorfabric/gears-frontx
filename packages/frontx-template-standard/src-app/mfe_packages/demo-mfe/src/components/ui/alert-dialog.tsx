import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "../../lib/utils"
import { buttonVariants } from "./button"
import { ButtonVariant } from "../types"

const AlertDialog = ({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) => (
  <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
)
AlertDialog.displayName = "AlertDialog"

const AlertDialogTrigger = (
  {
    ref,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Trigger> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Trigger>>;
  }
) => (<AlertDialogPrimitive.Trigger
  ref={ref}
  data-slot="alert-dialog-trigger"
  {...props}
/>)
AlertDialogTrigger.displayName = AlertDialogPrimitive.Trigger.displayName

const AlertDialogPortal = ({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) => (
  <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
)
AlertDialogPortal.displayName = "AlertDialogPortal"

const AlertDialogOverlay = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Overlay>>;
  }
) => (<AlertDialogPrimitive.Overlay
  ref={ref}
  data-slot="alert-dialog-overlay"
  className={cn(
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
    className
  )}
  {...props}
/>)
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Content>>;
  }
) => (<AlertDialogPortal>
  <AlertDialogOverlay />
  <AlertDialogPrimitive.Content
    ref={ref}
    data-slot="alert-dialog-content"
    className={cn(
      "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
      className
    )}
    {...props}
  />
</AlertDialogPortal>)
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="alert-dialog-header"
    className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
    {...props}
  />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="alert-dialog-footer"
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Title>>;
  }
) => (<AlertDialogPrimitive.Title
  ref={ref}
  data-slot="alert-dialog-title"
  className={cn("text-lg font-semibold", className)}
  {...props}
/>)
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Description>>;
  }
) => (<AlertDialogPrimitive.Description
  ref={ref}
  data-slot="alert-dialog-description"
  className={cn("text-muted-foreground text-sm", className)}
  {...props}
/>)
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName

const AlertDialogAction = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Action>>;
  }
) => (<AlertDialogPrimitive.Action
  ref={ref}
  className={cn(buttonVariants(), className)}
  {...props}
/>)
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Cancel>>;
  }
) => (<AlertDialogPrimitive.Cancel
  ref={ref}
  className={cn(buttonVariants({ variant: ButtonVariant.Outline }), className)}
  {...props}
/>)
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
