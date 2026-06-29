"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "../../lib/utils"

const Drawer = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root data-slot="drawer" {...props} />
)
Drawer.displayName = "Drawer"

const DrawerTrigger = (
  {
    ref,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Trigger> & {
    ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Trigger>>;
  }
) => (<DrawerPrimitive.Trigger ref={ref} data-slot="drawer-trigger" {...props} />)
DrawerTrigger.displayName = DrawerPrimitive.Trigger.displayName

const DrawerPortal = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) => (
  <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
)
DrawerPortal.displayName = "DrawerPortal"

const DrawerClose = (
  {
    ref,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Close> & {
    ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Close>>;
  }
) => (<DrawerPrimitive.Close ref={ref} data-slot="drawer-close" {...props} />)
DrawerClose.displayName = DrawerPrimitive.Close.displayName

const DrawerOverlay = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay> & {
    ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Overlay>>;
  }
) => (<DrawerPrimitive.Overlay
  ref={ref}
  data-slot="drawer-overlay"
  className={cn(
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
    className
  )}
  {...props}
/>)
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = (
  {
    ref,
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
    ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Content>>;
  }
) => (<DrawerPortal data-slot="drawer-portal">
  <DrawerOverlay />
  <DrawerPrimitive.Content
    ref={ref}
    data-slot="drawer-content"
    className={cn(
      "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
      "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
      "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
      "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
      "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
      className
    )}
    {...props}
  >
    <div className="bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
    {children}
  </DrawerPrimitive.Content>
</DrawerPortal>)
DrawerContent.displayName = DrawerPrimitive.Content.displayName

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="drawer-header"
    className={cn("flex flex-col gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="drawer-footer"
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title> & {
    ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Title>>;
  }
) => (<DrawerPrimitive.Title
  ref={ref}
  data-slot="drawer-title"
  className={cn("text-lg font-semibold text-foreground", className)}
  {...props}
/>)
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description> & {
    ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Description>>;
  }
) => (<DrawerPrimitive.Description
  ref={ref}
  data-slot="drawer-description"
  className={cn("text-sm text-muted-foreground", className)}
  {...props}
/>)
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
