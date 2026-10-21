"use client"

import type { RefObject } from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "cn"
import { useDialogPortal } from "@/components/dialog-portal"

const Select = SelectPrimitive.Root

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn("flex-1 truncate text-left", className)} {...props} />
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      type="button"
      data-slot="select-trigger"
      className={cn(
        "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition select-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-muted-foreground">
        <ChevronDown className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  ...props
}: SelectPrimitive.Popup.Props & Pick<SelectPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  const portal = useDialogPortal()

  return (
    <SelectPrimitive.Portal container={portal ?? undefined}>
      <SelectPosition portal={portal} className={className} side={side} sideOffset={sideOffset} align={align} {...props}>
        {children}
      </SelectPosition>
    </SelectPrimitive.Portal>
  )
}

function SelectPosition({
  portal,
  className,
  children,
  side,
  sideOffset,
  align,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "side" | "sideOffset"> & {
    portal: RefObject<HTMLElement | null> | null
  }) {
  const boundary = portal?.current ?? undefined

  return (
    <SelectPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignItemWithTrigger
      positionMethod="fixed"
      collisionBoundary={boundary}
      collisionPadding={8}
      collisionAvoidance={{ side: "flip", align: "shift" }}
      className="isolate z-50 outline-none"
    >
      <SelectPrimitive.Popup
        data-slot="select-content"
        className={cn(
          "z-50 max-h-[min(15rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-xl border border-border bg-card p-1 text-foreground shadow-xl outline-none transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.List>{children}</SelectPrimitive.List>
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center rounded-lg py-2 pr-8 pl-2.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-secondary data-highlighted:text-secondary-foreground",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="truncate">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center text-primary">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
