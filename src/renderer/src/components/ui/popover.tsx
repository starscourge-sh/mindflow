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
  // The top gap is the title bar's: a panel never covers the window's own buttons.
  collisionPadding = { top: 52, right: 8, bottom: 8, left: 8 },
  bare = false,
  ref,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  /**
   * Only the box that is placed, with nothing drawn: the panel is a card inside it (`mf-pop-card`), which may grow down
   * into room the box keeps for it without the box, or anything in the card above the change, ever moving (the
   * Calendar's popover, whose rows open in place). The box takes no clicks; its card does.
   */
  bare?: boolean
}) {
  // A caller's own ref (Display measures its panel) is called as well, kept in
  // hand so this stays one function: the sound and the key mark come once per
  // opening, and are never lost to the caller's ref.
  const theirs = React.useRef(ref)
  theirs.current = ref
  const opened = React.useCallback((node: HTMLDivElement | null) => {
    openCue(node)
    // A bare box takes no clicks, nor does the wrapper Radix places it in, as large as the box: its empty room below
    // the Calendar's popover took the click meant for a notice's Undo under it.
    const wrapper = node?.parentElement
    if (node?.classList.contains("mf-pop-hold") && wrapper?.hasAttribute("data-radix-popper-content-wrapper")) wrapper.style.pointerEvents = "none"
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
        sticky="always"
        // Opened by a key (F for Display, a menu's key), it is simply there: no entrance for what a key asked for (lib/motion.ts).
        // Marked once, as it opens (openCue above). Set again at every draw, a panel typed in and then clicked played its
        // entrance a second time: the mark came with the first key and went with the next click.
        className={bare
          ? cn("mf-pop-hold pointer-events-none z-50 flex max-h-(--radix-popover-content-available-height) flex-col outline-hidden", className)
          : cn(
          FLOAT,
          // Its entrance and exit are `mf-pop` (main.css): grown out of the trigger's side by a clip, the surface whole from
          // its first frame, never faded (a frosted surface fading in shows the page sharp through it until the fade ends).
          "mf-pop z-50 flex max-h-(--radix-popover-content-available-height) w-72 flex-col gap-4 overflow-y-auto rounded-lg p-2.5 text-xs outline-hidden",
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

/**
 * The small point that ties a popover to what it is about (the Calendar's new
 * event, to its slot), in the popover's own material: a square of it turned on
 * its corner, the half that shows cut out, so its two edges carry the same
 * hairline and it meets the panel with no seam. Its panel must not clip
 * (`overflow-visible`): the point sits outside the panel's box.
 */
function PopoverArrow({ className }: { className?: string }) {
  return (
    <PopoverPrimitive.Arrow asChild>
      <span data-slot="popover-arrow" aria-hidden className="block h-[7px] w-[14px] overflow-hidden">
        <span className={cn("mf-frost block size-[10px] translate-x-[2px] -translate-y-[5px] rotate-45 bg-popover ring-1 ring-foreground/10", className)} />
      </span>
    </PopoverPrimitive.Arrow>
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
}
