"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 10,
  align = "center",
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "ousia-rich-tooltip pointer-events-none z-50 flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) flex-col items-center justify-center overflow-hidden rounded-md border border-white/10 bg-neutral-950 px-4 py-2 text-xs text-white shadow-[0_14px_34px_-18px_rgba(0,0,0,0.82),0_4px_14px_-8px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.1)] outline-none has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-4xl",
          className
        )}
        {...props}
      >
        <span className="relative z-30 min-w-0 whitespace-pre-wrap text-center text-xs leading-tight font-semibold text-white tabular-nums">
          {children}
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 z-20 h-px w-1/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-[var(--ring)] to-transparent"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-8 z-20 h-px w-2/5 bg-gradient-to-r from-transparent via-[var(--radix-scale-9)] to-transparent"
        />
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-neutral-950 fill-neutral-950 data-[side=left]:translate-x-[-1.5px] data-[side=right]:translate-x-[1.5px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
