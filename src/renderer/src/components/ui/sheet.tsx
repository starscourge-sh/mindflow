import * as React from "react"
import { cn } from "@/lib/cn"
import { chime } from "@/lib/sound"
import { markKeyed } from "@/lib/motion"
import { Dialog as SheetPrimitive } from "radix-ui"
import { X as XIcon } from "@/components/ui/icons"
import { useShieldedOpen } from "./context-menu"

/** Whether the sheet is open and modal, for its shade (SheetOverlay): Radix draws its own only for a modal sheet. */
const SheetOpen = React.createContext<boolean | null>(null)

/**
 * Modal as before (the window behind takes no hover, press or scroll, a press on the shade closes it, Tab goes round
 * inside it), but by its own shade, as a menu is by its shield (context-menu.tsx MenuShield), never Radix's modal way:
 * that sets the body's pointer-events and a scroll lock on the body, and each restyles every element in the window, on
 * opening and on closing (seconds over a long page in the reader).
 */
function Sheet({ modal = true, ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const [open, onOpenChange] = useShieldedOpen(props)
  // A drawer slides out and folds away with the panel's sounds, however it
  // was opened (a click, a key, a menu).
  const was = React.useRef(props.open)
  React.useEffect(() => {
    if (props.open === undefined || props.open === was.current) return
    was.current = props.open
    chime(props.open ? "slide" : "fold")
  }, [props.open])
  return (
    <SheetOpen.Provider value={modal ? open : null}>
      <SheetPrimitive.Root data-slot="sheet" {...props} modal={false} onOpenChange={onOpenChange} />
    </SheetOpen.Provider>
  )
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

// The shade, a child of the portal as the panel is, so it comes and goes with it (the ref lets Radix wait for its fade
// out). It takes every press and scroll outside the panel; a press on it is outside the panel, so Radix closes the sheet.
function SheetOverlay({ className, ref }: { className?: string; ref?: React.Ref<HTMLDivElement> }) {
  const open = React.useContext(SheetOpen)
  if (open === null) return null
  return (
    <div
      ref={ref}
      data-slot="sheet-overlay"
      data-state={open ? "open" : "closed"}
      aria-hidden
      className={cn(
        "fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  const panel = React.useRef<HTMLDivElement>(null)
  // Opened by a key (⇧⌘D, F in a narrow window), it is simply there: main.css.
  const setPanel = React.useCallback((node: HTMLDivElement | null) => {
    panel.current = node
    markKeyed(node)
  }, [])

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={setPanel}
        data-slot="sheet-content"
        // The side its entrance grows towards, in `mf-pop`'s words (a popover on the left of its trigger grows leftwards):
        // a sheet on the window's right edge grows out of that edge, to the left.
        data-side={({ right: 'left', left: 'right', top: 'bottom', bottom: 'top' } as const)[side]}
        // Radix puts the focus on the first thing in here that takes it, which
        // is the close button - so a panel you opened to read came up with a
        // ring around its X. The panel itself takes it instead: the focus is
        // still inside, so Tab and Escape behave, but nothing looks pressed.
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          panel.current?.focus()
        }}
        className={cn(
          // Frosted in the main window (main.css .mf-frost); its shade is a sibling, so nothing over it fades. It comes in
          // and goes by `mf-pop` (main.css), as a popover does: grown out of the window's edge it sits on by a clip, whole
          // from its first frame, never faded (fading in, a frosted sheet showed the page sharp through it until the fade ended).
          "mf-pop mf-frost bg-background outline-hidden fixed z-50 flex flex-col gap-4 shadow-(--mf-panel-shadow)",
          side === "right" && "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" && "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" && "inset-x-0 top-0 h-auto border-b",
          side === "bottom" && "inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus-visible:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
}
