import * as React from "react"
import { FLOAT } from '@/lib/float'
import { cn } from "@/lib/cn"
import { Tooltip as TooltipPrimitive } from "radix-ui"

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

// Something opened (a menu, a popover, a sheet, a dialog) is what you are
// looking at: no tip draws over it. Only the tips of its own controls show
// while it is open, and a tip already showing goes when one opens.
const OPENED = '[data-state="open"]:is([role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"],[data-slot="popover-content"],[data-slot="sheet-content"])'
const covered = (trigger: Element | null): boolean => [...document.querySelectorAll(OPENED)].some((one) => !trigger || !one.contains(trigger))
let watching = false
const watchOpened = (): void => {
  if (watching) return
  watching = true
  new MutationObserver(() => {
    if (document.querySelector(OPENED)) window.dispatchEvent(new Event("haligtree:opened"))
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] })
}
// One tip at a time: a tip opening shuts the one before it. Going straight
// from one control onto the next (or from a count onto the row around it)
// otherwise left the first one showing beside the second.
let showing: (() => void) | null = null
const TriggerRef = React.createContext<React.RefObject<HTMLElement | null> | null>(null)

function Tooltip({
  open: given,
  defaultOpen = false,
  onOpenChange,
  // A tip is read, never hovered: it shuts the moment the pointer leaves its
  // control, rather than staying while the pointer heads its way.
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const trigger = React.useRef<HTMLElement | null>(null)
  const [own, setOwn] = React.useState(defaultOpen)
  const open = given ?? own
  const change = (next: boolean): void => {
    if (next && covered(trigger.current)) return
    setOwn(next)
    onOpenChange?.(next)
  }
  const changeNow = React.useRef(change)
  changeNow.current = change
  React.useEffect(() => {
    if (!open) return
    watchOpened()
    const mine = (): void => changeNow.current(false)
    if (showing) showing()
    showing = mine
    const shut = (): void => void (covered(trigger.current) && changeNow.current(false))
    // The pointer left the window (off its edge, or the window lost the keys):
    // no move comes after to close the tip, so it goes now.
    const gone = (): void => changeNow.current(false)
    window.addEventListener("haligtree:opened", shut)
    document.documentElement.addEventListener("mouseleave", gone)
    window.addEventListener("blur", gone)
    return () => {
      window.removeEventListener("haligtree:opened", shut)
      document.documentElement.removeEventListener("mouseleave", gone)
      window.removeEventListener("blur", gone)
      if (showing === mine) showing = null
    }
  }, [open])
  return (
    <TriggerRef.Provider value={trigger}>
      <TooltipPrimitive.Root data-slot="tooltip" open={open} onOpenChange={change} disableHoverableContent={disableHoverableContent} {...props} />
    </TriggerRef.Provider>
  )
}

function TooltipTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const trigger = React.useContext(TriggerRef)
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      ref={(node) => {
        if (trigger) trigger.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      {...props}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={8}
        // Inside the window always: slid along its side, or turned to the other side, never cut at an edge.
        avoidCollisions
        sticky="always"
        className={cn(
          FLOAT,
          // Closing, it fades out over 90ms rather than blinking away.
          "z-[100] inline-flex w-fit max-w-[min(20rem,calc(100vw-1rem))] [overflow-wrap:anywhere] origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-[90ms] has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
