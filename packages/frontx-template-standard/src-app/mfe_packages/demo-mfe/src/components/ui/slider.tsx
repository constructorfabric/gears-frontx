"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "../../lib/utils"

const Slider = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    ref?: React.Ref<React.ComponentRef<typeof SliderPrimitive.Root>>;
  }
) => (<SliderPrimitive.Root
  ref={ref}
  className={cn(
    "relative flex w-full touch-none select-none items-center",
    className
  )}
  {...props}
/>)
Slider.displayName = SliderPrimitive.Root.displayName

const SliderTrack = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Track> & {
    ref?: React.Ref<React.ComponentRef<typeof SliderPrimitive.Track>>;
  }
) => (<SliderPrimitive.Track
  ref={ref}
  className={cn(
    "relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20",
    className
  )}
  {...props}
/>)
SliderTrack.displayName = SliderPrimitive.Track.displayName

const SliderRange = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Range> & {
    ref?: React.Ref<React.ComponentRef<typeof SliderPrimitive.Range>>;
  }
) => (<SliderPrimitive.Range
  ref={ref}
  className={cn("absolute h-full bg-primary", className)}
  {...props}
/>)
SliderRange.displayName = SliderPrimitive.Range.displayName

const SliderThumb = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb> & {
    ref?: React.Ref<React.ComponentRef<typeof SliderPrimitive.Thumb>>;
  }
) => (<SliderPrimitive.Thumb
  ref={ref}
  className={cn(
    "block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    className
  )}
  {...props}
/>)
SliderThumb.displayName = SliderPrimitive.Thumb.displayName

export { Slider, SliderTrack, SliderRange, SliderThumb }
