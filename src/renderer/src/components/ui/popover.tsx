import * as React from "react"
import { FLOAT } from '@/lib/float'
import { quietClose } from "@/lib/quiet-focus"
import { cn } from "@/lib/cn"
import { openCue } from "@/lib/sound"

import { Popover as PopoverPrimitive } from "radix-ui"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  // Radix keeps a panel inside the window but will sit it flush against the
  // edge to do it. This is the gap it keeps instead. A panel is as tall as
  // what it holds, and scrolls only when that is more than the room it has.
  collisionPadding = 8,
  ref,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  // A caller's own ref (Display measures its panel) is called as well, kept in
  // hand so this stays one function: the sound and the key mark come once per
  // opening, and are never lost to the caller's ref.
  const theirs = React.useRef(ref)
  theirs.current = ref
  const opened = React.useCallback((node: HTMLDivElement | null) => {
    openCue(node)
    const own = theirs.current
    if (typeof own === "function") own(node)
    else if (own) own.current = node
  }, [])
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={opened}
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          FLOAT,
          "z-50 flex max-h-(--radix-popover-content-available-height) w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-4 overflow-y-auto rounded-lg p-2.5 text-xs outline-hidden duration-150 data-[state=closed]:duration-100 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
        onCloseAutoFocus={quietClose(props.onCloseAutoFocus)}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
}
