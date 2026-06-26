import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

const Collapsible = (
  {
    ref,
    ...props
  }: React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root> & {
    ref?: React.Ref<React.ComponentRef<typeof CollapsiblePrimitive.Root>>;
  }
) => (<CollapsiblePrimitive.Root
  ref={ref}
  data-slot="collapsible"
  {...props}
/>)
Collapsible.displayName = "Collapsible"

const CollapsibleTrigger = (
  {
    ref,
    ...props
  }: React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleTrigger> & {
    ref?: React.Ref<React.ComponentRef<typeof CollapsiblePrimitive.CollapsibleTrigger>>;
  }
) => (<CollapsiblePrimitive.CollapsibleTrigger
  ref={ref}
  data-slot="collapsible-trigger"
  {...props}
/>)
CollapsibleTrigger.displayName = "CollapsibleTrigger"

const CollapsibleContent = (
  {
    ref,
    ...props
  }: React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent> & {
    ref?: React.Ref<React.ComponentRef<typeof CollapsiblePrimitive.CollapsibleContent>>;
  }
) => (<CollapsiblePrimitive.CollapsibleContent
  ref={ref}
  data-slot="collapsible-content"
  {...props}
/>)
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
