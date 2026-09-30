import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"

import { cn } from "@/lib/tiptap-utils"

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>): React.JSX.Element {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandInput({
  className,
  shortcut,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  /** The key that opens this list, shown at the end of the row. */
  shortcut?: string
}): React.JSX.Element {
  return (
    <div data-slot="command-input-wrapper" className="flex items-center gap-2 border-b px-3">
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-10 w-full bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      {shortcut && (
        <kbd className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>): React.JSX.Element {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        // Never taller than the room the popover actually has. Radix measures
        // the gap to the window edge for us; the 3.5rem is the search box
        // above, which is part of that room and not part of this list.
        "max-h-[min(9rem,calc(var(--radix-popover-content-available-height,100vh)-3.5rem))]",
        "scroll-py-1 overflow-x-hidden overflow-y-auto p-1",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty(
  props: React.ComponentProps<typeof CommandPrimitive.Empty>
): React.JSX.Element {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm text-muted-foreground"
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>): React.JSX.Element {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>): React.JSX.Element {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">): React.JSX.Element {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
}
