import * as React from "react"
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
    if (document.querySelector(OPENED)) window.dispatchEvent(new Event("vigil:opened"))
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] })
}
const TriggerRef = React.createContext<React.RefObject<HTMLElement | null> | null>(null)

function Tooltip({
  open: given,
  defaultOpen = false,
  onOpenChange,
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
    const shut = (): void => void (covered(trigger.current) && changeNow.current(false))
    window.addEventListener("vigil:opened", shut)
    return () => window.removeEventListener("vigil:opened", shut)
  }, [open])
  return (
    <TriggerRef.Provider value={trigger}>
      <TooltipPrimitive.Root data-slot="tooltip" open={open} onOpenChange={change} {...props} />
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
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[0_6px_20px_-6px_rgb(0_0_0/0.5)] has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
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
