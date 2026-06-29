import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"

import { cn } from "../../lib/utils"
import { ChevronDownIcon } from "../icons/ChevronDownIcon"

const Accordion = (
  {
    ref,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root> & {
    ref?: React.Ref<React.ComponentRef<typeof AccordionPrimitive.Root>>;
  }
) => (<AccordionPrimitive.Root
  ref={ref}
  data-slot="accordion"
  {...props}
/>)
Accordion.displayName = "Accordion"

const AccordionItem = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> & {
    ref?: React.Ref<React.ComponentRef<typeof AccordionPrimitive.Item>>;
  }
) => (<AccordionPrimitive.Item
  ref={ref}
  data-slot="accordion-item"
  className={cn("border-b last:border-b-0", className)}
  {...props}
/>)
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = (
  {
    ref,
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
    ref?: React.Ref<React.ComponentRef<typeof AccordionPrimitive.Trigger>>;
  }
) => (<AccordionPrimitive.Header className="flex">
  <AccordionPrimitive.Trigger
    ref={ref}
    data-slot="accordion-trigger"
    className={cn(
      "flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] focus-visible:border-ring focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
      className
    )}
    {...props}
  >
    {children}
    <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
  </AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>)
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionContent = (
  {
    ref,
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> & {
    ref?: React.Ref<React.ComponentRef<typeof AccordionPrimitive.Content>>;
  }
) => (<AccordionPrimitive.Content
  ref={ref}
  data-slot="accordion-content"
  className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
  {...props}
>
  <div className={cn("pt-0 pb-4", className)}>{children}</div>
</AccordionPrimitive.Content>)
AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
